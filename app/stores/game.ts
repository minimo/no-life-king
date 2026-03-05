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
    // Radius: 150 to 300, proportional to production (cap is max)
    const ratio = Math.min(1, base.production / base.productionCap)
    return 150 + (300 - 150) * ratio
}

export interface Unit {
    id: string
    owner: Owner
    sourceId: string
    targetId: string
    power: number
    progress: number // 0 to 1
    duration: number
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
    3: { cap: 220, growth: 4.5, upgradeCost: 120 },
}

const UNIT_SPEED = 120 // px/sec

export const useGameStore = defineStore('game', {
    state: () => ({
        mapGrid: [] as number[][], // 51x51 grid (0: Grass, 1: Water, 2: Mountain, 3: Wood, 4: Bridge)
        bases: [] as Base[],
        units: [] as Unit[],
        sendRatio: 0.5,
        isGameOver: false,
        winner: null as Owner | null,
        targetSelectThreshold: 40,
        cpuThinkingTimer: 0,
        status: 'title' as 'title' | 'playing' | 'gameover',
    }),

    actions: {
        initGame() {
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
                        this.mapGrid[y][x] = 2 // Mountain
                    } else if (m > 0.3) {
                        this.mapGrid[y][x] = 3 // Wood
                    } else {
                        this.mapGrid[y][x] = 0 // Grass
                    }
                }
            }

            // 4. Carve Rivers
            const numRivers = Math.floor(Math.random() * 3) // 0 to 2

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
                const riverPoints: { x: number, y: number }[] = []

                let lastNx = -1
                let lastNy = -1

                const recordPoint = (nx: number, ny: number) => {
                    if (this.mapGrid[ny] && this.mapGrid[ny][nx] !== undefined) {
                        this.mapGrid[ny][nx] = 1 // Water
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

                // Add up to 3 bridges for this river system
                const maxBridges = Math.floor(Math.random() * 4) // 0 to 3
                for (let b = 0; b < maxBridges; b++) {
                    if (riverPoints.length === 0) break

                    // Find a valid straight point
                    let validIdx = -1
                    let attempt = 0
                    while (attempt < 10) {
                        const idx = Math.floor(Math.random() * riverPoints.length)
                        const point = riverPoints[idx]
                        if (!point) {
                            attempt++
                            continue
                        }
                        const x = point.x
                        const y = point.y
                        if (this.mapGrid[y] && this.mapGrid[y][x] === 1) {
                            // Check straightness: Horizontal or Vertical water blocks
                            const isHoriz = (this.mapGrid[y]?.[x - 1] === 1 && this.mapGrid[y]?.[x + 1] === 1 && this.mapGrid[y - 1]?.[x] !== 1 && this.mapGrid[y + 1]?.[x] !== 1)
                            const isVert = (this.mapGrid[y - 1]?.[x] === 1 && this.mapGrid[y + 1]?.[x] === 1 && this.mapGrid[y]?.[x - 1] !== 1 && this.mapGrid[y]?.[x + 1] !== 1)
                            if (isHoriz || isVert) {
                                validIdx = idx
                                break
                            }
                        }
                        attempt++
                    }

                    if (validIdx !== -1) {
                        const point = riverPoints[validIdx]
                        if (point) {
                            this.mapGrid[point.y][point.x] = 4 // Set to bridge
                            // Remove surrounding points to avoid clustered bridges
                            riverPoints.splice(Math.max(0, validIdx - 8), 16)
                            continue
                        }
                    }

                    // If no valid straight point found after attempts, just remove a random one to prevent infinite loops on tiny rivers
                    const failIdx = Math.floor(Math.random() * riverPoints.length)
                    riverPoints.splice(Math.max(0, failIdx - 8), 16)
                }
            }
            // Assign variations for Mountains and Woods
            let waterCount = 0
            for (let y = 0; y <= 50; y++) {
                for (let x = 0; x <= 50; x++) {
                    if (this.mapGrid[y] && this.mapGrid[y][x] === 1) waterCount++
                    if (this.mapGrid[y] && this.mapGrid[y][x] === 3) {
                        // Wood 1 to 9 -> map to 31 to 39
                        this.mapGrid[y][x] = 31 + Math.floor(Math.random() * 9)
                    } else if (this.mapGrid[y] && this.mapGrid[y][x] === 2) {
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
                            this.mapGrid[y][x] = 23 + Math.floor(Math.random() * 2) // 23, 24
                        } else {
                            this.mapGrid[y][x] = 21 + Math.floor(Math.random() * 2) // 21, 22
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
                            if (this.mapGrid[ny][nx] !== 1) { // Do not erase rivers
                                this.mapGrid[ny][nx] = 0 // Grass
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
                currentZoneRadius: owner === 'neutral' ? 0 : 150,
            }
        },

        sendUnits(sourceId: string, targetId: string) {
            if (this.isGameOver) return

            const source = this.bases.find((b: Base) => b.id === sourceId)
            const target = this.bases.find((b: Base) => b.id === targetId)
            if (!source || !target || source.id === target.id) return

            const sendPower = Math.floor(source.production * this.sendRatio)
            if (sendPower < 1) return

            source.production -= sendPower

            const dx = target.x - source.x
            const dy = target.y - source.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            const duration = distance / UNIT_SPEED

            this.units.push({
                id: Math.random().toString(36).substr(2, 9),
                owner: source.owner,
                sourceId: source.id,
                targetId: target.id,
                power: sendPower,
                progress: 0,
                duration,
                x: source.x,
                y: source.y,
                elapsedTime: 0,
            })
        },

        update(deltaSeconds: number) {
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
                                unit.x += (dx / dist) * UNIT_SPEED * deltaSeconds
                                unit.y += (dy / dist) * UNIT_SPEED * deltaSeconds
                            }
                        } else {
                            unit.pursuitTargetId = null
                        }
                    } else {
                        // Regular movement towards base
                        unit.progress += deltaSeconds / unit.duration
                        const source = this.bases.find(b => b.id === unit.sourceId)
                        const target = this.bases.find(b => b.id === unit.targetId)
                        if (target) {
                            const startX = source?.x ?? unit.x
                            const startY = source?.y ?? unit.y
                            unit.x = startX + (target.x - startX) * unit.progress
                            unit.y = startY + (target.y - startY) * unit.progress
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

                const source = this.bases.find(b => b.id === unit.sourceId)
                const target = this.bases.find(b => b.id === unit.targetId)

                if (!target) {
                    this.units.splice(i, 1)
                    continue
                }

                if (unit.power <= 0) {
                    this.units.splice(i, 1)
                    continue
                }

                if (unit.progress >= 1) {
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

        resolveCombat(unit: Unit, target: Base) {
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

        upgradeBase(baseId: string) {
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

        updateCPU(delta: number) {
            this.cpuThinkingTimer -= delta
            if (this.cpuThinkingTimer <= 0) {
                this.cpuThinkingTimer = Math.random() * 1.0 + 0.5
                this.executeCPUAction()
            }
        },

        executeCPUAction() {
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

        tryCPUSend(source: Base, target: Base) {
            if (!source || !target) return false
            const available = Math.floor(source.production * 0.5)
            const required = target.owner !== source.owner ? target.production + 5 : 0

            if (available >= required && available >= 1) {
                // Temp set ratio to 0.5 for CPU
                const oldRatio = this.sendRatio
                this.sendRatio = 0.5
                this.sendUnits(source.id, target.id)
                this.sendRatio = oldRatio
                return true
            }
            return false
        },

        checkGameOver() {
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

        startGame() {
            this.status = 'playing'
            this.initGame()
        },

        backToTitle() {
            this.status = 'title'
        }
    }
})
