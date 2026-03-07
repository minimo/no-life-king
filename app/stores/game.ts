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

/** dayTimeが昼間(6:00-18:00 = 360-1080分)かどうかを返す */
export function isDaytime(dayTime: number): boolean {
    return dayTime >= 360 && dayTime < 1080
}

/** 時間帯による移動速度倍率を返す（昼間CPU: ×0.6、夜間プレイヤー: ×0.75） */
function getTimeSpeedMultiplier(owner: Owner, dayTime: number): number {
    if (owner === 'neutral') return 1.0
    const daytime = isDaytime(dayTime)
    // 昼間: CPUが0.6倍、夜間: プレイヤーが0.75倍
    if (daytime && owner === 'cpu') return 0.6
    if (!daytime && owner === 'player') return 0.75
    return 1.0
}

/** 時間帯による防御力消費倍率を返す（昼間CPU: ×1.5、夜間プレイヤー: ×1.3） */
function getTimeDecayMultiplier(owner: Owner, dayTime: number): number {
    const daytime = isDaytime(dayTime)
    if (daytime && owner === 'cpu') return 1.5
    if (!daytime && owner === 'player') return 1.3
    return 1.0
}

export function calculateTargetZoneRadius(base: Base, dayTime: number): number {
    if (base.owner === 'neutral') return 0
    // Radius: 75 to 150, proportional to production (cap is max)
    const ratio = Math.min(1, base.production / base.productionCap)
    let radius = 75 + (150 - 75) * ratio
    // 昼間: CPUの支配領域×0.65、夜間: プレイヤーの支配領域×0.75
    const daytime = isDaytime(dayTime)
    if (daytime && base.owner === 'cpu') radius *= 0.65
    if (!daytime && base.owner === 'player') radius *= 0.75
    return radius
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
    1: { cap: 100, growth: 2.0, upgradeCost: 80 },
    2: { cap: 150, growth: 3.0, upgradeCost: 120 },
    3: { cap: 999, growth: 4.5, upgradeCost: Infinity },
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
        mult = 0.0 // 侵入不可
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
    if (tile === 1) return Infinity // 水（侵入不可）
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
    dayTime: number // 累計分（0〜1439）
    status: 'title' | 'playing' | 'gameover' | 'paused'
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
        dayTime: 360, // 6:00 AM (6 * 60)
        status: 'title',
    }),

    actions: {
        initGame(): void {
            this.bases = []
            this.units = []
            this.isGameOver = false
            this.winner = null
            this.cpuThinkingTimer = Math.random() * 1.0 + 0.5
            this.dayTime = 360 // 毎回 am 6:00 からリセット
            this.status = 'playing'

            // Logical coordinate system: 0 to 800
            const size = 800
            const margin = 100
            const minDistance = 100

            // 1. Generate Map (51x51 logic grid for 800x800 area with step 16)
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

            // 2. Carve Rivers
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

            // 川で完全に分断された陸地（一定以上の広さ）がある場合は、橋で結ぶ
            let landsConnected = false;
            let landConnectAttempts = 0;
            while (!landsConnected && landConnectAttempts < 10) {
                landConnectAttempts++;
                const visitedGrid = new Set<number>();
                const key = (x: number, y: number) => y * 51 + x;
                const landGroups: { x: number, y: number }[][] = [];

                for (let y = 0; y <= 50; y++) {
                    for (let x = 0; x <= 50; x++) {
                        const tile = this.mapGrid[y]?.[x] ?? 0;
                        if (tile !== 1 && !visitedGrid.has(key(x, y))) {
                            const group: { x: number, y: number }[] = [];
                            const queue: { x: number, y: number }[] = [{ x, y }];
                            visitedGrid.add(key(x, y));

                            let qIdx = 0;
                            while (qIdx < queue.length) {
                                const cur = queue[qIdx++]!;
                                group.push(cur);

                                const DIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
                                for (const [dx, dy] of DIRS) {
                                    const nx = cur.x + dx;
                                    const ny = cur.y + dy;
                                    if (nx >= 0 && nx <= 50 && ny >= 0 && ny <= 50) {
                                        const nTile = this.mapGrid[ny]?.[nx] ?? 0;
                                        if (nTile !== 1) {
                                            const nk = key(nx, ny);
                                            if (!visitedGrid.has(nk)) {
                                                visitedGrid.add(nk);
                                                queue.push({ x: nx, y: ny });
                                            }
                                        }
                                    }
                                }
                            }
                            // 一定以上の広さを持つ陸地のみ（広さ20超）
                            if (group.length > 20) {
                                landGroups.push(group);
                            }
                        }
                    }
                }

                if (landGroups.length <= 1) {
                    landsConnected = true;
                } else {
                    // グループ0とグループ1の海岸線を探し、最も近い2点を橋で繋ぐ
                    const getShoreline = (group: { x: number, y: number }[]) => {
                        return group.filter(p => {
                            const DIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
                            for (const [dx, dy] of DIRS) {
                                const nx = p.x + dx;
                                const ny = p.y + dy;
                                if (nx >= 0 && nx <= 50 && ny >= 0 && ny <= 50) {
                                    if (this.mapGrid[ny]?.[nx] === 1) return true;
                                }
                            }
                            return false;
                        });
                    };

                    const shoreA = getShoreline(landGroups[0]!);
                    const shoreB = getShoreline(landGroups[1]!);

                    let minD = Infinity;
                    let bestPair: { a: { x: number, y: number }, b: { x: number, y: number } } | null = null;

                    const ptsA = shoreA.length > 0 ? shoreA : landGroups[0]!;
                    const ptsB = shoreB.length > 0 ? shoreB : landGroups[1]!;

                    for (const a of ptsA) {
                        for (const b of ptsB) {
                            const d = Math.hypot(a.x - b.x, a.y - b.y);
                            if (d < minD) {
                                minD = d;
                                bestPair = { a, b };
                            }
                        }
                    }

                    if (bestPair) {
                        let x0 = bestPair.a.x;
                        let y0 = bestPair.a.y;
                        const x1 = bestPair.b.x;
                        const y1 = bestPair.b.y;

                        const dx = Math.abs(x1 - x0);
                        const dy = Math.abs(y1 - y0);
                        const sx = x0 < x1 ? 1 : -1;
                        const sy = y0 < y1 ? 1 : -1;
                        let err = dx - dy;

                        while (true) {
                            if (x0 >= 0 && x0 <= 50 && y0 >= 0 && y0 <= 50) {
                                if (this.mapGrid[y0]?.[x0] === 1) {
                                    this.mapGrid[y0]![x0] = 4; // 橋を追加
                                }
                            }
                            if (x0 === x1 && y0 === y1) break;
                            const e2 = 2 * err;
                            if (e2 > -dy) {
                                err -= dy;
                                x0 += sx;
                            }
                            if (e2 < dx) {
                                err += dx;
                                y0 += sy;
                            }
                        }
                    } else {
                        break; // ありえないがデッドロック防止のため
                    }
                }
            }

            // 3. Create Bases
            const isValidBaseLocation = (wx: number, wy: number) => {
                const gx = Math.round(wx / 16)
                const gy = Math.round(wy / 16)
                if (gy >= 0 && gy <= 50 && gx >= 0 && gx <= 50) {
                    const tile = this.mapGrid[gy]![gx]
                    if (tile === 1 || tile === 4) return false // Water or Bridge
                }
                // Check distance from existing bases
                const tooClose = this.bases.some(b => Math.hypot(b.x - wx, b.y - wy) < minDistance)
                if (tooClose) return false

                return true
            }

            // A helper to place a core base, avoiding water
            const placeCore = (id: string, owner: Owner, startX: number, startY: number, stepX: number, stepY: number) => {
                let bx = startX
                let by = startY
                let attempts = 0
                while (!isValidBaseLocation(bx, by) && attempts < 50) {
                    bx += stepX
                    by += stepY
                    attempts++
                }
                this.bases.push(this.createBase(id, owner, 1, true, bx, by))
            }

            // Player Core (Bottom-Left map corner)
            placeCore('p-core', 'player', margin, size - margin, 16, -16)

            // CPU Core (Top-Right map corner)
            placeCore('c-core', 'cpu', size - margin, margin, -16, 16)

            // 固定の中立砦 (左上と右下)
            // 左上: (margin, margin) 付近
            let luX = margin, luY = margin;
            let luAttempts = 0;
            while (!isValidBaseLocation(luX, luY) && luAttempts < 50) {
                luX += 16; luY += 16; luAttempts++;
            }
            this.bases.push(this.createBase('n-fort-lu', 'neutral', 2, false, luX, luY, 50));

            // 右下: (size - margin, size - margin) 付近
            let rdX = size - margin, rdY = size - margin;
            let rdAttempts = 0;
            while (!isValidBaseLocation(rdX, rdY) && rdAttempts < 50) {
                rdX -= 16; rdY -= 16; rdAttempts++;
            }
            this.bases.push(this.createBase('n-fort-rd', 'neutral', 2, false, rdX, rdY, 50));

            // 追加のランダムな中立砦 (0-2個)
            const extraFortsCount = Math.floor(Math.random() * 3); // 0, 1, 2
            let fortAttempts = 0;
            while (this.bases.filter(b => b.owner === 'neutral' && b.rank === 2).length < 2 + extraFortsCount && fortAttempts < 200) {
                fortAttempts++;
                const x = margin + Math.random() * (size - margin * 2);
                const y = margin + Math.random() * (size - margin * 2);
                if (isValidBaseLocation(x, y)) {
                    const id = `n-fort-${this.bases.length}`;
                    this.bases.push(this.createBase(id, 'neutral', 2, false, x, y, 50));
                }
            }

            // 中立集落 (8-14個)
            const villageCount = Math.floor(Math.random() * 7) + 8; // 8 to 14
            let neutralAttempts = 0;
            while (this.bases.filter(b => b.owner === 'neutral' && b.rank === 1).length < villageCount && neutralAttempts < 500) {
                neutralAttempts++
                const x = margin + Math.random() * (size - margin * 2)
                const y = margin + Math.random() * (size - margin * 2)

                // Check terrain validity and distance
                if (!isValidBaseLocation(x, y)) continue

                const id = `n-vill-${this.bases.length}`
                this.bases.push(this.createBase(id, 'neutral', 1, false, x, y))
            }

            // 4. Clear area around bases
            this.bases.forEach(base => {
                const gridX = Math.round(base.x / 16)
                const gridY = Math.round(base.y / 16)
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const ny = gridY + dy
                        const nx = gridX + dx
                        if (ny >= 0 && ny <= 50 && nx >= 0 && nx <= 50) {
                            if (this.mapGrid[ny]![nx] !== 1 && this.mapGrid[ny]![nx] !== 4) { // Do not erase rivers or bridges
                                this.mapGrid[ny]![nx] = 0 // Grass
                            }
                        }
                    }
                }
            })
        },

        createBase(id: string, owner: Owner, rank: Rank, isCore: boolean, x: number, y: number, initialProduction?: number): Base {
            const config = RANK_CONFIG[rank]
            let prod = initialProduction;
            if (prod === undefined) {
                prod = owner === 'neutral' ? 10 : 20;
            }
            return {
                id,
                owner,
                rank,
                isCore,
                production: prod,
                productionCap: config.cap,
                growthRate: config.growth,
                x,
                y,
                radius: 16, // Visual half of 32x32
                currentZoneRadius: owner === 'neutral' ? 0 : 75,
            }
        },

        sendUnits(sourceId: string, targetId: string): void {
            if (this.status !== 'playing') return

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

        stopUnit(unitId: string): void {
            const unitIndex = this.units.findIndex((u) => u.id === unitId)
            if (unitIndex !== -1) {
                const unit = this.units[unitIndex]!
                // 派遣元の拠点がまだ自軍のものであれば、パワーの半分を拠点に還元する
                const source = this.bases.find(b => b.id === unit.sourceId)
                if (source && source.owner === unit.owner) {
                    source.production = Math.min(source.productionCap, source.production + unit.power * 0.5)
                }
                this.units.splice(unitIndex, 1)
            }
        },

        pauseGame(): void {
            if (this.status === 'playing') {
                this.status = 'paused'
            }
        },

        resumeGame(): void {
            if (this.status === 'paused') {
                this.status = 'playing'
            }
        },

        update(deltaSeconds: number): void {
            if (this.status !== 'playing') return

            // Update Game Time (TEST: 1 sec real time = 30 min game time)
            this.dayTime = (this.dayTime + deltaSeconds * 30) % 1440

            // 1. Production & Easing
            for (const base of this.bases) {
                if (base.owner !== 'neutral') {
                    base.production += base.growthRate * deltaSeconds
                    if (base.production > base.productionCap) {
                        base.production = base.productionCap
                    }
                }

                // Update Zone Radius with Lerp (0.5s time constant)
                const target = calculateTargetZoneRadius(base, this.dayTime)
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
                                const pursuitTimeMult = getTimeSpeedMultiplier(unit.owner, this.dayTime)
                                unit.x += (dx / dist) * UNIT_SPEED * pursuitSpeedMult * pursuitTimeMult * deltaSeconds
                                unit.y += (dy / dist) * UNIT_SPEED * pursuitSpeedMult * pursuitTimeMult * deltaSeconds
                            }
                        } else {
                            unit.pursuitTargetId = null
                        }
                    } else {
                        // Regular movement: follow waypoints
                        const nextWP = unit.path[unit.pathIndex + 1]
                        if (nextWP) {
                            const moveSpeedMult = getTerrainSpeedMultiplier(this.mapGrid, unit.x, unit.y, unit.owner, this.bases)
                            const moveTimeMult = getTimeSpeedMultiplier(unit.owner, this.dayTime)
                            const speed = UNIT_SPEED * moveSpeedMult * moveTimeMult
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
                            const timeDecay = getTimeDecayMultiplier(unit.owner, this.dayTime)
                            unit.power -= decayRate * decayMultiplier * timeDecay * deltaSeconds
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
                    const oldOwner = target.owner
                    target.owner = unit.owner

                    // 中立拠点を占領した場合はランクを維持、敵拠点を占領した場合はランク1にリセット
                    if (oldOwner !== 'neutral') {
                        target.rank = 1
                    }

                    const config = RANK_CONFIG[target.rank]
                    target.production = newProduction
                    target.productionCap = config.cap
                    target.growthRate = config.growth
                }
            }
        },

        upgradeBase(baseId: string): boolean {
            const base = this.bases.find(b => b.id === baseId)
            if (!base || base.rank >= 3) return false

            const config = RANK_CONFIG[base.rank]
            const cost = config.upgradeCost

            if (base.production >= cost) {
                base.production -= cost
                base.rank = (base.rank + 1) as Rank
                const nextConfig = RANK_CONFIG[base.rank]
                base.productionCap = nextConfig.cap
                base.growthRate = nextConfig.growth
                return true
            }
            return false
        },

        // A*経路探索のラッパー（GameCanvas.vueからプレビュー用に利用）
        getPath(startWX: number, startWY: number, endWX: number, endWY: number, owner: Owner): { x: number; y: number }[] {
            return findPath(this.mapGrid, startWX, startWY, endWX, endWY, owner)
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
                const config = RANK_CONFIG[source.rank];
                const cost = config.upgradeCost;
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
