import { defineStore } from 'pinia'
import { createNoise2D } from 'simplex-noise'

export type Owner = 'player' | 'cpu' | 'neutral'
export type Rank = 1 | 2 | 3

export interface Base {
    id: string
    owner: Owner
    rank: Rank
    production: number
    productionCap: number
    growthRate: number
    isCore: boolean
    x: number
    y: number
    radius: number
    currentZoneRadius: number
}

export function calculateTargetZoneRadius(base: Base): number {
    if (base.owner === 'neutral') return 0
    // Radius: 75 to 150, proportional to production (cap is max)
    const ratio = Math.min(1, base.production / base.productionCap)
    return 75 + (150 - 75) * ratio
}

export interface Unit {
    id: string
    owner: Owner
    sourceId: string
    targetId: string
    power: number
    path: { x: number; y: number }[]
    pathIndex: number
    x: number
    y: number
    elapsedTime: number
    isFighting?: boolean
    fightingTargetId?: string | null
    pursuitTargetId?: string | null
}

export const RANK_CONFIG = {
    1: { cap: 100, growth: 2, upgradeCost: Infinity },
    2: { cap: 150, growth: 3, upgradeCost: 80 },
    3: { cap: 999, growth: 4.5, upgradeCost: 120 },
}

const UNIT_SPEED = 30 // px/sec

/** ユニット現在位置の地形タイルから速度倍率を返す */
function getTerrainSpeedMultiplier(mapGrid: number[][], worldX: number, worldY: number, owner: Owner, bases: Base[]): number {
    const gx = Math.round(worldX / 16)
    const gy = Math.round(worldY / 16)
    if (gy < 0 || gy > 50 || gx < 0 || gx > 50) return 1.0
    const tile = mapGrid[gy]?.[gx] ?? 0

    // 砦の影響範囲内か判定
    let inZone = false
    for (const base of bases) {
        if (base.owner !== 'neutral') {
            const dist = Math.hypot(worldX - base.x, worldY - base.y)
            if (dist <= base.currentZoneRadius) {
                inZone = true
                break
            }
        }
    }

    let mult = 1.0

    // 水
    if (tile === 1) {
        mult = (inZone || owner !== 'cpu') ? 0.4 : 0.1
    }
    // 橋
    else if (tile === 4) { mult = 1.0 }
    // 低山 (21-22)
    else if (tile === 21 || tile === 22) { mult = 0.5 }
    // 高山 (23-24)
    else if (tile === 23 || tile === 24) { mult = 0.35 }
    // 木・疎 (31-33)
    else if (tile >= 31 && tile <= 33) { mult = 0.85 }
    // 木・密 (34-35)
    else if (tile === 34 || tile === 35) { mult = 0.7 }

    // 砦の影響範囲内ならペナルティを50%軽減（倍率を1.0に寄せる）
    if (inZone && mult < 1.0) {
        mult = mult + (1.0 - mult) * 0.5
    }

    return mult
}

/** グリッドタイルの移動コストを返す（速度倍率の逆数）*/
function getTileCost(mapGrid: number[][], gx: number, gy: number, owner: Owner): number {
    if (gy < 0 || gy > 50 || gx < 0 || gx > 50) return 1.0
    const tile = mapGrid[gy]?.[gx] ?? 0
    if (tile === 1) return owner === 'cpu' ? 10.0 : 2.5 // 水
    if (tile === 4) return 1.0 // 橋
    if (tile === 21 || tile === 22) return 2.0 // 低山
    if (tile === 23 || tile === 24) return 2.86 // 高山
    if (tile >= 31 && tile <= 33) return 1.18 // 木・疎
    if (tile === 34 || tile === 35) return 1.43 // 木・密
    return 1.0
}

/** A*経路探索: グリッド座標で探索し、ワールド座標のウェイポイント配列を返す */
function findPath(mapGrid: number[][], startWX: number, startWY: number, endWX: number, endWY: number, owner: Owner): { x: number; y: number }[] {
    const sx = Math.round(startWX / 16)
    const sy = Math.round(startWY / 16)
    const ex = Math.round(endWX / 16)
    const ey = Math.round(endWY / 16)

    // グリッド範囲外なら直線パス
    if (sx < 0 || sx > 50 || sy < 0 || sy > 50 || ex < 0 || ex > 50 || ey < 0 || ey > 50) {
        return [{ x: startWX, y: startWY }, { x: endWX, y: endWY }]
    }

    // A*
    const DIRS: [number, number, number][] = [
        [-1, -1, 1.414], [-1, 0, 1], [-1, 1, 1.414],
        [0, -1, 1], [0, 1, 1],
        [1, -1, 1.414], [1, 0, 1], [1, 1, 1.414],
    ]

    const key = (x: number, y: number) => y * 51 + x
    const gScore = new Map<number, number>()
    const fScore = new Map<number, number>()
    const cameFrom = new Map<number, number>()

    // 簡易バイナリヒープ (open set)
    const open: { k: number; f: number }[] = []
    const inOpen = new Set<number>()
    const closed = new Set<number>()

    const pushOpen = (k: number, f: number) => {
        open.push({ k, f })
        inOpen.add(k)
        // bubble up
        let i = open.length - 1
        while (i > 0) {
            const pi = (i - 1) >> 1
            if (open[pi]!.f <= open[i]!.f) break
            const tmp = open[pi]!; open[pi] = open[i]!; open[i] = tmp
            i = pi
        }
    }
    const popOpen = (): { k: number; f: number } | undefined => {
        if (open.length === 0) return undefined
        const top = open[0]!
        inOpen.delete(top.k)
        const last = open.pop()!
        if (open.length > 0) {
            open[0] = last
            let i = 0
            while (true) {
                let smallest = i
                const l = 2 * i + 1, r = 2 * i + 2
                if (l < open.length && open[l]!.f < open[smallest]!.f) smallest = l
                if (r < open.length && open[r]!.f < open[smallest]!.f) smallest = r
                if (smallest === i) break
                const tmp = open[i]!; open[i] = open[smallest]!; open[smallest] = tmp
                i = smallest
            }
        }
        return top
    }

    const heuristic = (x: number, y: number) => {
        const dx = Math.abs(x - ex)
        const dy = Math.abs(y - ey)
        return Math.max(dx, dy) + (1.414 - 1) * Math.min(dx, dy)
    }

    const sk = key(sx, sy)
    gScore.set(sk, 0)
    fScore.set(sk, heuristic(sx, sy))
    pushOpen(sk, heuristic(sx, sy))

    const ek = key(ex, ey)
    let found = false

    while (open.length > 0) {
        const cur = popOpen()!
        if (cur.k === ek) { found = true; break }
        closed.add(cur.k)

        const cx = cur.k % 51
        const cy = (cur.k - cx) / 51
        const curG = gScore.get(cur.k) ?? Infinity

        for (const [ddx, ddy, baseDist] of DIRS) {
            const nx = cx + ddx
            const ny = cy + ddy
            if (nx < 0 || nx > 50 || ny < 0 || ny > 50) continue
            const nk = key(nx, ny)
            if (closed.has(nk)) continue

            const tileCost = getTileCost(mapGrid, nx, ny, owner)
            const tentG = curG + baseDist * tileCost

            if (tentG < (gScore.get(nk) ?? Infinity)) {
                cameFrom.set(nk, cur.k)
                gScore.set(nk, tentG)
                const f = tentG + heuristic(nx, ny)
                fScore.set(nk, f)
                if (!inOpen.has(nk)) {
                    pushOpen(nk, f)
                }
            }
        }
    }

    if (!found) {
        // パスが見つからない場合は直線
        return [{ x: startWX, y: startWY }, { x: endWX, y: endWY }]
    }

    // パス復元
    const gridPath: { x: number; y: number }[] = []
    let ck = ek
    while (ck !== undefined) {
        const cx = ck % 51
        const cy = (ck - cx) / 51
        gridPath.unshift({ x: cx, y: cy })
        if (ck === sk) break
        ck = cameFrom.get(ck)!
    }

    // パスをワールド座標に変換し、直線上の中間点を除去（簡略化）
    const worldPath: { x: number; y: number }[] = []
    for (let i = 0; i < gridPath.length; i++) {
        const p = gridPath[i]!
        if (i > 0 && i < gridPath.length - 1) {
            const prev = gridPath[i - 1]!
            const next = gridPath[i + 1]!
            // 方向が同じなら中間点をスキップ
            if (p.x - prev.x === next.x - p.x && p.y - prev.y === next.y - p.y) continue
        }
        worldPath.push({ x: p.x * 16, y: p.y * 16 })
    }

    // 開始点と終了点をワールド座標で正確にセット
    if (worldPath.length > 0) {
        worldPath[0] = { x: startWX, y: startWY }
        worldPath[worldPath.length - 1] = { x: endWX, y: endWY }
    }

    return worldPath
}

export interface GameState {
    mapGrid: number[][]
    bases: Base[]
    units: Unit[]
    sendRatio: number
    isGameOver: boolean
    winner: Owner | null
    targetSelectThreshold: number
    cpuThinkingTimer: number
    status: 'title' | 'playing' | 'gameover'
}

export const useGameStore = defineStore('game', {
    state: (): GameState => ({
        mapGrid: [], // 51x51 grid (0: Grass, 1: Water, 2: Mountain, 3: Wood, 4: Bridge)
        bases: [],
        units: [],
        sendRatio: 0.5,
        isGameOver: false,
        winner: null,
        targetSelectThreshold: 40,
        cpuThinkingTimer: 0,
        status: 'title',
    }),

    actions: {
        initGame(): void {
            this.bases = []
            this.units = []
            this.isGameOver = false
            this.winner = null
            this.cpuThinkingTimer = Math.random() * 1.0 + 0.5
            this.status = 'playing'

            // Logical coordinate system: 0 to 800
            const size = 800
            const margin = 100
            const minDistance = 100

            // 1. Create Core Bases
            // Player Core (Bottom-Left map corner -> Screen Left)
            const pCoreX = margin
            const pCoreY = size - margin
            this.bases.push(this.createBase('p-core', 'player', 1, true, pCoreX, pCoreY))

            // CPU Core (Top-Right map corner -> Screen Right)
            const cCoreX = size - margin
            const cCoreY = margin
            this.bases.push(this.createBase('c-core', 'cpu', 1, true, cCoreX, cCoreY))

            // 2. Create Neutral Bases
            const baseCount = Math.floor(Math.random() * 7) + 8 // 10 to 15 total bases
            let attempts = 0
            while (this.bases.length < baseCount && attempts < 200) {
                attempts++
                // Place bases at the player side (left) or cpu side (right) map quadrants
                const isLeftEdge = Math.random() < 0.5
                const x = isLeftEdge ? margin + Math.random() * 300 : size - margin - Math.random() * 300
                const y = isLeftEdge ? size - margin - Math.random() * 300 : margin + Math.random() * 300

                // Check distance from existing bases
                const tooClose = this.bases.some(b => Math.hypot(b.x - x, b.y - y) < minDistance)
                if (!tooClose) {
                    const id = `n${this.bases.length - 1}`
                    this.bases.push(this.createBase(id, 'neutral', 1, false, x, y))
                }
            }

            // 3. Generate Map (51x51 logic grid for 800x800 area with step 16)
            const noise2D_elev = createNoise2D()
            const noise2D_moist = createNoise2D()
            this.mapGrid = Array(51).fill(0).map(() => Array(51).fill(0))

            for (let y = 0; y <= 50; y++) {
                for (let x = 0; x <= 50; x++) {
                    const nx = x / 50 - 0.5
                    const ny = y / 50 - 0.5
                    // FBM (Fractal Brownian Motion)
                    let e = noise2D_elev(nx * 3, ny * 3) + 0.5 * noise2D_elev(nx * 6, ny * 6)
                    e = e / 1.5 // normalize

                    let m = noise2D_moist(nx * 3, ny * 3) + 0.5 * noise2D_moist(nx * 6, ny * 6)
                    m = m / 1.5 // normalize

                    if (e > 0.45) {
                        this.mapGrid[y]![x] = 2 // Mountain
                    } else if (m > 0.3) {
                        this.mapGrid[y]![x] = 3 // Wood
                    } else {
                        this.mapGrid[y]![x] = 0 // Grass
                    }
                }
            }

            // 4. Carve Rivers
            const numRivers = 1 + Math.floor(Math.random() * 2) // 1 to 2
            const riverPoints: { x: number, y: number }[] = []

            for (let r = 0; r < numRivers; r++) {
                const isHorizontal = Math.random() < 0.5
                let startX: number, startY: number, endX: number, endY: number

                if (isHorizontal) {
                    startX = 0
                    startY = Math.floor(Math.random() * 40) + 5
                    endX = 50
                    endY = Math.floor(Math.random() * 40) + 5
                } else {
                    startX = Math.floor(Math.random() * 40) + 5
                    startY = 0
                    endX = Math.floor(Math.random() * 40) + 5
                    endY = 50
                }

                const riverNoise = createNoise2D()

                let lastNx = -1
                let lastNy = -1

                const recordPoint = (nx: number, ny: number) => {
                    if (this.mapGrid[ny] && this.mapGrid[ny]![nx] !== undefined) {
                        this.mapGrid[ny]![nx] = 1 // Water
                        if (nx >= 2 && nx <= 48 && ny >= 2 && ny <= 48) {
                            if (!riverPoints.find(p => p.x === nx && p.y === ny)) {
                                riverPoints.push({ x: nx, y: ny })
                            }
                        }
                    }
                }

                const carveRiverPath = (x0: number, y0: number, x1: number, y1: number) => {
                    const dist = Math.hypot(x1 - x0, y1 - y0)
                    const steps = Math.ceil(dist * 5)
                    for (let i = 0; i <= steps; i++) {
                        const t = i / steps
                        const lx = x0 + (x1 - x0) * t
                        const ly = y0 + (y1 - y0) * t
                        // Decreased frequency (lx/20) and amplitude (4) for smoother rivers
                        const offset = riverNoise(lx / 20, ly / 20) * 4
                        let pdx = -(y1 - y0) / (dist || 1)
                        let pdy = (x1 - x0) / (dist || 1)
                        const curX = lx + pdx * offset
                        const curY = ly + pdy * offset

                        const nx = Math.round(curX)
                        const ny = Math.round(curY)

                        if (lastNx !== -1 && lastNy !== -1) {
                            if (Math.abs(nx - lastNx) >= 1 && Math.abs(ny - lastNy) >= 1) {
                                recordPoint(nx, lastNy)
                            }
                        }

                        recordPoint(nx, ny)
                        lastNx = nx
                        lastNy = ny
                    }
                }

                carveRiverPath(startX, startY, endX, endY)

                // Branching
                if (Math.random() < 1 / 3) {
                    const branchT = 0.3 + Math.random() * 0.4
                    const branchStartX = startX + (endX - startX) * branchT
                    const branchStartY = startY + (endY - startY) * branchT
                    let branchEndX: number, branchEndY: number

                    if (isHorizontal) {
                        branchEndX = Math.max(0, Math.min(50, branchStartX + (Math.random() - 0.5) * 50))
                        branchEndY = Math.random() < 0.5 ? 0 : 50
                    } else {
                        branchEndX = Math.random() < 0.5 ? 0 : 50
                        branchEndY = Math.max(0, Math.min(50, branchStartY + (Math.random() - 0.5) * 50))
                    }
                    carveRiverPath(branchStartX, branchStartY, branchEndX, branchEndY)
                }
            }

            // 川が全て生成された後に橋をかける
            // Add 2 to 4 bridges per river system
            const maxBridges = numRivers * (2 + Math.floor(Math.random() * 3)) // numRivers * (2 to 4)
            for (let b = 0; b < maxBridges; b++) {
                if (riverPoints.length === 0) break

                // Find a valid straight point
                let validIdx = -1
                let attempt = 0
                while (attempt < 20) {
                    const idx = Math.floor(Math.random() * riverPoints.length)
                    const point = riverPoints[idx]
                    if (!point) {
                        attempt++
                        continue
                    }
                    const x = point.x
                    const y = point.y
                    if (this.mapGrid[y] && this.mapGrid[y]![x] === 1) {
                        // Check straightness & ensure bridge ends are valid land
                        const top = this.mapGrid[y - 1]?.[x]
                        const bottom = this.mapGrid[y + 1]?.[x]
                        const left = this.mapGrid[y]?.[x - 1]
                        const right = this.mapGrid[y]?.[x + 1]

                        const isValidLand = (tile: number | undefined) => tile !== undefined && tile !== 1 && tile !== 4

                        const isRiverHoriz = (left === 1 && right === 1 && isValidLand(top) && isValidLand(bottom))
                        const isRiverVert = (top === 1 && bottom === 1 && isValidLand(left) && isValidLand(right))

                        if (isRiverHoriz || isRiverVert) {
                            validIdx = idx
                            break
                        }
                    }
                    attempt++
                }

                if (validIdx !== -1) {
                    const point = riverPoints[validIdx]
                    if (point) {
                        this.mapGrid[point.y]![point.x] = 4 // Set to bridge
                        // Remove surrounding points to avoid clustered bridges
                        riverPoints.splice(Math.max(0, validIdx - 8), 16)
                        continue
                    }
                }

                // If no valid straight point found after attempts, just remove a random one to prevent infinite loops on tiny rivers
                const failIdx = Math.floor(Math.random() * riverPoints.length)
                riverPoints.splice(Math.max(0, failIdx - 8), 16)
            }
            // Assign variations for Mountains and Woods
            let waterCount = 0
            for (let y = 0; y <= 50; y++) {
                for (let x = 0; x <= 50; x++) {
                    if (this.mapGrid[y] && this.mapGrid[y]![x] === 1) waterCount++
                    if (this.mapGrid[y] && this.mapGrid[y]![x] === 3) {
                        // Calculate tree density based on surrounding tiles
                        let treeCount = 0
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                if (dx === 0 && dy === 0) continue
                                const nx = x + dx
                                const ny = y + dy
                                if (nx >= 0 && nx <= 50 && ny >= 0 && ny <= 50) {
                                    const neighborId = this.mapGrid[ny]?.[nx]
                                    // Count as a tree if it's 3, or if it's already assigned a variant 31-39
                                    if (neighborId === 3 || (neighborId !== undefined && Math.floor(neighborId / 10) === 3)) {
                                        treeCount++
                                    }
                                }
                            }
                        }

                        // We have 5 variations (1-5, mapped to 31-35).
                        // Tree count is max 8.
                        // Higher index (34-35) = denser. Lower index (31-33) = sparser.
                        let variantOffset = 0
                        if (treeCount >= 6) {
                            // Deep forest: highly likely to be 34-35, sometimes 33
                            variantOffset = 2 + Math.floor(Math.random() * 3) // 2, 3, 4 (maps to 33, 34, 35)
                        } else if (treeCount >= 3) {
                            // Mid forest: mix of all, skewed middle
                            variantOffset = 1 + Math.floor(Math.random() * 4) // 1, 2, 3, 4 (maps to 32, 33, 34, 35)
                        } else {
                            // Edge of forest: likely to be 31-32, sometimes 33
                            variantOffset = Math.floor(Math.random() * 3) // 0, 1, 2 (maps to 31, 32, 33)
                        }

                        this.mapGrid[y]![x] = 31 + variantOffset
                    } else if (this.mapGrid[y] && this.mapGrid[y]![x] === 2) {
                        // Mountain
                        let isHigh = true
                        const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]
                        for (const [dx, dy] of dirs) {
                            const nx = x + dx
                            const ny = y + dy
                            if (nx >= 0 && nx <= 50 && ny >= 0 && ny <= 50) {
                                // If any neighbour is NOT a mountain, it's not surrounded
                                const neighborId = this.mapGrid[ny]?.[nx]
                                if (neighborId !== undefined && neighborId !== 2 && Math.floor(neighborId / 10) !== 2) {
                                    isHigh = false
                                    break
                                }
                            } else {
                                isHigh = false
                                break
                            }
                        }
                        if (isHigh) {
                            this.mapGrid[y]![x] = 23 + Math.floor(Math.random() * 2) // 23, 24
                        } else {
                            this.mapGrid[y]![x] = 21 + Math.floor(Math.random() * 2) // 21, 22
                        }

                    }
                }
            }

            // Clear area around bases
            this.bases.forEach(base => {
                const gridX = Math.round(base.x / 16)
                const gridY = Math.round(base.y / 16)
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const ny = gridY + dy
                        const nx = gridX + dx
                        if (ny >= 0 && ny <= 50 && nx >= 0 && nx <= 50) {
                            if (this.mapGrid[ny]![nx] !== 1) { // Do not erase rivers
                                this.mapGrid[ny]![nx] = 0 // Grass
                            }
                        }
                    }
                }
            })

            // Add bridges between bases where line of sight crosses water
            // (Removed previous logic to randomly place exactly 0-3 bridges per river)
        },

        createBase(id: string, owner: Owner, rank: Rank, isCore: boolean, x: number, y: number): Base {
            const config = RANK_CONFIG[rank]
            return {
                id,
                owner,
                rank,
                isCore,
                production: owner === 'neutral' ? 10 : 20,
                productionCap: config.cap,
                growthRate: config.growth,
                x,
                y,
                radius: 16, // Visual half of 32x32
                currentZoneRadius: owner === 'neutral' ? 0 : 75,
            }
        },

        sendUnits(sourceId: string, targetId: string): void {
            if (this.isGameOver) return

            const source = this.bases.find((b: Base) => b.id === sourceId)
            const target = this.bases.find((b: Base) => b.id === targetId)
            if (!source || !target || source.id === target.id) return

            const sendPower = Math.floor(source.production * this.sendRatio)
            if (sendPower < 1) return

            source.production -= sendPower

            const path = findPath(this.mapGrid, source.x, source.y, target.x, target.y, source.owner)

            this.units.push({
                id: Math.random().toString(36).substr(2, 9),
                owner: source.owner,
                sourceId: source.id,
                targetId: target.id,
                power: sendPower,
                path,
                pathIndex: 0,
                x: source.x,
                y: source.y,
                elapsedTime: 0,
            })
        },

        update(deltaSeconds: number): void {
            if (this.isGameOver) return

            // 1. Production & Easing
            for (const base of this.bases) {
                if (base.owner !== 'neutral') {
                    base.production += base.growthRate * deltaSeconds
                    if (base.production > base.productionCap) {
                        base.production = base.productionCap
                    }
                }

                // Update Zone Radius with Lerp (0.5s time constant)
                const target = calculateTargetZoneRadius(base)
                const easeSpeed = 2.0
                base.currentZoneRadius += (target - base.currentZoneRadius) * easeSpeed * deltaSeconds
            }

            // 2. Movement & Combat
            for (let i = this.units.length - 1; i >= 0; i--) {
                const unit = this.units[i]
                if (!unit) continue

                // Combat Check (Collision)
                if (!unit.isFighting) {
                    for (let j = 0; j < i; j++) {
                        const other = this.units[j]
                        if (other && other.owner !== unit.owner && !other.isFighting) {
                            const dist = Math.hypot(unit.x - other.x, unit.y - other.y)
                            if (dist < 12) { // Proximity threshold
                                unit.isFighting = true
                                other.isFighting = true
                                unit.fightingTargetId = other.id
                                other.fightingTargetId = unit.id
                                break
                            }
                        }
                    }
                }

                // Resolve Combat Depletion
                if (unit.isFighting && unit.fightingTargetId) {
                    const target = this.units.find(u => u.id === unit.fightingTargetId)
                    if (target) {
                        // Rate: ~2.5s for power 10 -> ~4 power/sec. 
                        // But let's scale it so combat duration is roughly consistent.
                        // Decrease by e.g. 5 power/sec or proportional?
                        // User: "2-3秒かけて双方の攻撃力を減らしてください"
                        // Rate = Math.max(unit.power, target.power) / 2.5
                        const rate = 10 // Fixed rate for simplicity, or we can use the max.
                        unit.power -= rate * deltaSeconds
                    } else {
                        // Target destroyed
                        unit.isFighting = false
                        unit.fightingTargetId = null
                    }
                }

                // Progress Movement if not fighting
                if (!unit.isFighting) {
                    // Search for pursuit target
                    if (!unit.pursuitTargetId) {
                        for (const other of this.units) {
                            if (other && other.owner !== unit.owner) {
                                const dist = Math.hypot(unit.x - other.x, unit.y - other.y)
                                if (dist < 50) {
                                    unit.pursuitTargetId = other.id
                                    break
                                }
                            }
                        }
                    }

                    if (unit.pursuitTargetId) {
                        const targetUnit = this.units.find(u => u.id === unit.pursuitTargetId)
                        if (targetUnit) {
                            // Move towards target unit
                            const dx = targetUnit.x - unit.x
                            const dy = targetUnit.y - unit.y
                            const dist = Math.hypot(dx, dy)
                            if (dist > 2) {
                                const pursuitSpeedMult = getTerrainSpeedMultiplier(this.mapGrid, unit.x, unit.y, unit.owner, this.bases)
                                unit.x += (dx / dist) * UNIT_SPEED * pursuitSpeedMult * deltaSeconds
                                unit.y += (dy / dist) * UNIT_SPEED * pursuitSpeedMult * deltaSeconds
                            }
                        } else {
                            unit.pursuitTargetId = null
                        }
                    } else {
                        // Regular movement: follow waypoints
                        const nextWP = unit.path[unit.pathIndex + 1]
                        if (nextWP) {
                            const moveSpeedMult = getTerrainSpeedMultiplier(this.mapGrid, unit.x, unit.y, unit.owner, this.bases)
                            const speed = UNIT_SPEED * moveSpeedMult
                            const dx = nextWP.x - unit.x
                            const dy = nextWP.y - unit.y
                            const dist = Math.hypot(dx, dy)
                            const step = speed * deltaSeconds
                            if (dist <= step) {
                                // ウェイポイント到達
                                unit.x = nextWP.x
                                unit.y = nextWP.y
                                unit.pathIndex++
                            } else {
                                unit.x += (dx / dist) * step
                                unit.y += (dy / dist) * step
                            }
                        }
                    }

                    unit.elapsedTime += deltaSeconds

                    // Power decay after 1 second
                    if (unit.elapsedTime > 1.0) {
                        let decayMultiplier = 1.0
                        let inNeutralZone = true

                        // Check if in any influence zone (150-300px)
                        for (const base of this.bases) {
                            if (base.owner !== 'neutral') {
                                const zoneRadius = base.currentZoneRadius
                                const dist = Math.hypot(unit.x - base.x, unit.y - base.y)
                                if (dist <= zoneRadius) {
                                    inNeutralZone = false
                                    if (base.owner === unit.owner) {
                                        decayMultiplier = 0 // Stop decay in friendly zone
                                    } else {
                                        decayMultiplier = 2.0 // Increase decay in hostile zone (2x)
                                    }
                                    break
                                }
                            }
                        }

                        if (decayMultiplier > 0) {
                            const decayRate = 1.0 // 1 power per second
                            unit.power -= decayRate * decayMultiplier * deltaSeconds
                        }
                    }
                }

                const target = this.bases.find(b => b.id === unit.targetId)

                if (!target) {
                    this.units.splice(i, 1)
                    continue
                }

                if (unit.power <= 0) {
                    this.units.splice(i, 1)
                    continue
                }

                // 最終ウェイポイントに到達したら到着
                if (unit.pathIndex >= unit.path.length - 1) {
                    this.resolveCombat(unit, target)
                    this.units.splice(i, 1)
                } else {
                    // Update position handled above in movement branch
                }
            }

            // 3. CPU Logic
            this.updateCPU(deltaSeconds)

            // 4. Game Over check
            this.checkGameOver()
        },

        resolveCombat(unit: Unit, target: Base): void {
            if (unit.owner === target.owner) {
                target.production += unit.power
                if (target.production > target.productionCap) {
                    target.production = target.productionCap
                }
            } else {
                target.production -= unit.power
                if (target.production <= 0) {
                    const newProduction = Math.abs(target.production)
                    target.owner = unit.owner
                    target.rank = 1
                    const config = RANK_CONFIG[1]
                    target.production = newProduction
                    target.productionCap = config.cap
                    target.growthRate = config.growth
                }
            }
        },

        upgradeBase(baseId: string): void {
            const base = this.bases.find(b => b.id === baseId)
            if (!base || base.rank >= 3) return

            const nextRank = (base.rank + 1) as Rank
            const cost = RANK_CONFIG[nextRank === 2 ? 2 : 3].upgradeCost // Simplification: next rank cost

            if (base.production >= cost) {
                base.production -= cost
                base.rank = nextRank
                const config = RANK_CONFIG[nextRank]
                base.productionCap = config.cap
                base.growthRate = config.growth
            }
        },

        updateCPU(delta: number): void {
            this.cpuThinkingTimer -= delta
            if (this.cpuThinkingTimer <= 0) {
                this.cpuThinkingTimer = Math.random() * 1.0 + 0.5
                this.executeCPUAction()
            }
        },

        executeCPUAction(): void {
            const cpuBases = this.bases.filter(b => b.owner === 'cpu')
            if (cpuBases.length === 0) return

            // Select random cpu base to send from
            const source = cpuBases[Math.floor(Math.random() * cpuBases.length)]

            // Target selection based on priority
            // 1. Core defense
            const cpuCore = this.bases.find(b => b.owner === 'cpu' && b.isCore)
            if (cpuCore && source && cpuCore.production < cpuCore.productionCap * 0.3) {
                // Send from another base if possible
                if (source.id !== cpuCore.id) {
                    this.tryCPUSend(source, cpuCore)
                    return
                }
            }

            // 2. Near neutral
            const neutrals = this.bases.filter(b => b.owner === 'neutral')
            if (neutrals.length > 0 && source) {
                neutrals.sort((a, b) => {
                    const distA = Math.hypot(a.x - source.x, a.y - source.y)
                    const distB = Math.hypot(b.x - source.x, b.y - source.y)
                    return distA - distB
                })
                if (this.tryCPUSend(source, neutrals[0] as Base)) return
            }

            // 3. Player attack
            const playerBases = this.bases.filter(b => b.owner === 'player')
            if (playerBases.length > 0 && source) {
                playerBases.sort((a, b) => {
                    const distA = Math.hypot(a.x - source.x, a.y - source.y)
                    const distB = Math.hypot(b.x - source.x, b.y - source.y)
                    return distA - distB
                })
                if (this.tryCPUSend(source, playerBases[0] as Base)) return
            }

            // 4. Upgrade if possible
            if (source && source.rank < 3) {
                const nextRank = (source.rank + 1) as Rank
                const cost = (nextRank === 2 ? RANK_CONFIG[2].upgradeCost : RANK_CONFIG[3].upgradeCost) as number;
                if (source.production >= cost + 20) { // Keep some production for defense
                    this.upgradeBase(source.id)
                }
            }
        },

        tryCPUSend(source: Base, target: Base): boolean {
            if (!source || !target) return false
            const available = Math.floor(source.production * 0.5)
            const required = target.owner !== source.owner ? target.production + 5 : 0

            if (available >= required && available >= 1) {
                // A*パスから移動時間を推定し、到着時の残り体力を見積もる
                const path = findPath(this.mapGrid, source.x, source.y, target.x, target.y, 'cpu')
                let totalDist = 0
                for (let i = 0; i < path.length - 1; i++) {
                    totalDist += Math.hypot(path[i + 1]!.x - path[i]!.x, path[i + 1]!.y - path[i]!.y)
                }
                // 平均地形速度を考慮（パスコスト / 直線距離の比率で推定）
                const straightDist = Math.hypot(target.x - source.x, target.y - source.y)
                const detourRatio = straightDist > 0 ? totalDist / straightDist : 1
                const estimatedTravelTime = totalDist / (UNIT_SPEED * (1 / Math.max(detourRatio * 0.5, 0.3)))
                // 減衰: 1秒後から1 power/sec（中立地帯想定）
                const decayTime = Math.max(0, estimatedTravelTime - 1.0)
                const estimatedPowerAtArrival = available - decayTime * 1.0

                // 到着時に敵拠点を制圧できるか / 友軍に到着できるかを判定
                const minRequired = target.owner !== source.owner ? target.production * 0.5 : 1
                if (estimatedPowerAtArrival < minRequired) return false

                // Temp set ratio to 0.5 for CPU
                const oldRatio = this.sendRatio
                this.sendRatio = 0.5
                this.sendUnits(source.id, target.id)
                this.sendRatio = oldRatio
                return true
            }
            return false
        },

        checkGameOver(): void {
            const playerCore = this.bases.find(b => b.isCore && b.owner === 'player')
            const cpuCore = this.bases.find(b => b.isCore && b.owner === 'cpu')

            if (!playerCore) {
                this.isGameOver = true
                this.winner = 'cpu'
            } else if (!cpuCore) {
                this.isGameOver = true
                this.winner = 'player'
            }

            if (this.isGameOver) {
                this.status = 'gameover'
            }
        },

        startGame(): void {
            this.status = 'playing'
            this.initGame()
        },

        backToTitle(): void {
            this.status = 'title'
        }
    }
})
