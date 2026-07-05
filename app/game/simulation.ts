import { RANK_CONFIG, UNIT_SPEED } from './constants'
import { calculateTargetZoneRadius, getTimeDecayMultiplier, getTimeSpeedMultiplier } from './daynight'
import { findPath } from './pathfinding'
import { getTerrainSpeedMultiplier } from './terrain'
import type { Base, GameState, Rank, Unit } from '../types/game'

export function sendUnits(state: GameState, sourceId: string, targetId: string, ratio = state.sendRatio): void {
    if (state.status !== 'playing') return

    const source = state.bases.find((b: Base) => b.id === sourceId)
    const target = state.bases.find((b: Base) => b.id === targetId)
    if (!source || !target || source.id === target.id) return

    const sendPower = Math.floor(source.production * ratio)
    if (sendPower < 1) return

    source.production -= sendPower

    const path = findPath(state.mapGrid, source.x, source.y, target.x, target.y, source.rank)

    state.units.push({
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
        rank: source.rank,
    })
}

export function redirectUnit(state: GameState, unitId: string, targetId: string): void {
    if (state.status !== 'playing') return

    const unit = state.units.find(u => u.id === unitId)
    const target = state.bases.find(b => b.id === targetId)
    if (!unit || !target) return

    // 元々の目的地と同じなら何もしない
    if (unit.targetId === targetId && !unit.isStopped) return

    unit.targetId = targetId
    unit.isStopped = false
    unit.path = findPath(state.mapGrid, unit.x, unit.y, target.x, target.y, unit.rank)
    unit.pathIndex = 0
    unit.elapsedTime = 0
}

export function stopUnit(state: GameState, unitId: string): void {
    const unit = state.units.find((u) => u.id === unitId)
    if (unit) {
        unit.isStopped = true
        unit.path = [{ x: unit.x, y: unit.y }]
        unit.pathIndex = 0
    }
}

export function updateSimulation(state: GameState, deltaSeconds: number): void {
    // Update Game Time (TEST: 1 sec real time = 30 min game time)
    state.dayTime = (state.dayTime + deltaSeconds * 30) % 1440

    // 1. Production & Easing
    for (const base of state.bases) {
        if (base.owner !== 'neutral') {
            base.production += base.growthRate * deltaSeconds
            if (base.production > base.productionCap) {
                base.production = base.productionCap
            }
        }

        // Update Zone Radius with Lerp (0.5s time constant)
        const target = calculateTargetZoneRadius(base, state.dayTime)
        const easeSpeed = 2.0
        base.currentZoneRadius += (target - base.currentZoneRadius) * easeSpeed * deltaSeconds
    }

    // 2. Movement & Combat
    for (let i = state.units.length - 1; i >= 0; i--) {
        const unit = state.units[i]
        if (!unit) continue

        // Combat Check (Collision)
        if (!unit.isFighting) {
            for (let j = 0; j < i; j++) {
                const other = state.units[j]
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
            const target = state.units.find(u => u.id === unit.fightingTargetId)
            if (target) {
                // Rate: ~2.5s for power 10 -> ~4 power/sec.
                // But let's scale it so combat duration is roughly consistent.
                // Rate = Math.max(unit.power, target.power) / 2.5
                // 金色ユニット (Rank 3) は攻撃力 1.1倍
                const attackMult = unit.rank === 3 ? 1.1 : 1.0
                const rate = 10 * attackMult
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
                for (const other of state.units) {
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
                const targetUnit = state.units.find(u => u.id === unit.pursuitTargetId)
                if (targetUnit) {
                    // Move towards target unit
                    const dx = targetUnit.x - unit.x
                    const dy = targetUnit.y - unit.y
                    const dist = Math.hypot(dx, dy)
                    if (dist > 2) {
                        const pursuitSpeedMult = getTerrainSpeedMultiplier(state.mapGrid, unit.x, unit.y, state.bases, unit.rank)
                        const pursuitTimeMult = getTimeSpeedMultiplier(unit.owner, state.dayTime)
                        // 金色ユニット (Rank 3) は移動速度 1.1倍
                        const rankSpeedMult = unit.rank === 3 ? 1.1 : 1.0
                        unit.x += (dx / dist) * UNIT_SPEED * pursuitSpeedMult * pursuitTimeMult * rankSpeedMult * deltaSeconds
                        unit.y += (dy / dist) * UNIT_SPEED * pursuitSpeedMult * pursuitTimeMult * rankSpeedMult * deltaSeconds
                    }
                } else {
                    unit.pursuitTargetId = null
                }
            } else if (!unit.isStopped) {
                // Regular movement: follow waypoints
                const nextWP = unit.path[unit.pathIndex + 1]
                if (nextWP) {
                    const moveSpeedMult = getTerrainSpeedMultiplier(state.mapGrid, unit.x, unit.y, state.bases, unit.rank)
                    const moveTimeMult = getTimeSpeedMultiplier(unit.owner, state.dayTime)
                    // 金色ユニット (Rank 3) は移動速度 1.1倍
                    const rankSpeedMult = unit.rank === 3 ? 1.1 : 1.0
                    const speed = UNIT_SPEED * moveSpeedMult * moveTimeMult * rankSpeedMult
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
                for (const base of state.bases) {
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
                    // 自然減衰率: 通常=1.0, 赤=1.1, 金=1.2
                    const rankDecayRate = unit.rank === 2 ? 1.1 : (unit.rank === 3 ? 1.2 : 1.0)
                    const decayRate = 1.0 * rankDecayRate // Base: 1 power per second
                    const timeDecay = getTimeDecayMultiplier(unit.owner, state.dayTime)
                    unit.power -= decayRate * decayMultiplier * timeDecay * deltaSeconds
                }
            }
        }

        const target = state.bases.find(b => b.id === unit.targetId)

        if (!target) {
            state.units.splice(i, 1)
            continue
        }

        if (unit.power <= 0) {
            state.units.splice(i, 1)
            continue
        }

        // 最終ウェイポイントに到達したら到着（停止中はスキップ）
        if (!unit.isStopped && unit.pathIndex >= unit.path.length - 1) {
            resolveCombat(unit, target)
            state.units.splice(i, 1)
        } else {
            // Update position handled above in movement branch
        }
    }
}

export function resolveCombat(unit: Unit, target: Base): void {
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
}

export function upgradeBase(state: GameState, baseId: string): boolean {
    const base = state.bases.find(b => b.id === baseId)
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
}

export function checkGameOver(state: GameState): void {
    const playerCore = state.bases.find(b => b.isCore && b.owner === 'player')
    const cpuCore = state.bases.find(b => b.isCore && b.owner === 'cpu')

    if (!playerCore) {
        state.isGameOver = true
        state.winner = 'cpu'
    } else if (!cpuCore) {
        state.isGameOver = true
        state.winner = 'player'
    }

    if (state.isGameOver) {
        state.status = 'gameover'
    }
}
