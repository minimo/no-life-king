import { defineStore } from 'pinia'

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

            const width = 1920
            const height = 1080
            const margin = 100
            const minDistance = 180

            // 1. Create Core Bases
            // Player Core (Left side)
            const pCoreX = margin + Math.random() * 200
            const pCoreY = margin + Math.random() * (height - margin * 2)
            this.bases.push(this.createBase('p-core', 'player', 1, true, pCoreX, pCoreY))

            // CPU Core (Right side)
            const cCoreX = width - margin - Math.random() * 200
            const cCoreY = margin + Math.random() * (height - margin * 2)
            this.bases.push(this.createBase('c-core', 'cpu', 1, true, cCoreX, cCoreY))

            // 2. Create Neutral Bases
            const baseCount = Math.floor(Math.random() * 9) + 12 // 12 to 20 total bases
            let attempts = 0
            while (this.bases.length < baseCount && attempts < 100) {
                attempts++
                const x = margin + Math.random() * (width - margin * 2)
                const y = margin + Math.random() * (height - margin * 2)

                // Check distance from existing bases
                const tooClose = this.bases.some(b => Math.hypot(b.x - x, b.y - y) < minDistance)
                if (!tooClose) {
                    const id = `n${this.bases.length - 1}`
                    this.bases.push(this.createBase(id, 'neutral', 1, false, x, y))
                }
            }
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

            const source = this.bases.find(b => b.id === sourceId)
            const target = this.bases.find(b => b.id === targetId)
            if (!source || !target || source.id === targetId) return

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
