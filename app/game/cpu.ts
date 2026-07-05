import { RANK_CONFIG, UNIT_SPEED } from './constants'
import { findPath } from './pathfinding'
import { sendUnits, upgradeBase } from './simulation'
import type { Base, GameState } from '../types/game'

export function updateCPU(state: GameState, delta: number): void {
    state.cpuThinkingTimer -= delta
    if (state.cpuThinkingTimer <= 0) {
        state.cpuThinkingTimer = Math.random() * 1.0 + 0.5
        executeCPUAction(state)
    }
}

export function executeCPUAction(state: GameState): void {
    const cpuBases = state.bases.filter(b => b.owner === 'cpu')
    if (cpuBases.length === 0) return

    // Select random cpu base to send from
    const source = cpuBases[Math.floor(Math.random() * cpuBases.length)]

    // Target selection based on priority
    // 1. Core defense
    const cpuCore = state.bases.find(b => b.owner === 'cpu' && b.isCore)
    if (cpuCore && source && cpuCore.production < cpuCore.productionCap * 0.3) {
        // Send from another base if possible
        if (source.id !== cpuCore.id) {
            tryCPUSend(state, source, cpuCore)
            return
        }
    }

    // 2. Near neutral
    const neutrals = state.bases.filter(b => b.owner === 'neutral')
    if (neutrals.length > 0 && source) {
        neutrals.sort((a, b) => {
            const distA = Math.hypot(a.x - source.x, a.y - source.y)
            const distB = Math.hypot(b.x - source.x, b.y - source.y)
            return distA - distB
        })
        if (tryCPUSend(state, source, neutrals[0] as Base)) return
    }

    // 3. Player attack
    const playerBases = state.bases.filter(b => b.owner === 'player')
    if (playerBases.length > 0 && source) {
        playerBases.sort((a, b) => {
            const distA = Math.hypot(a.x - source.x, a.y - source.y)
            const distB = Math.hypot(b.x - source.x, b.y - source.y)
            return distA - distB
        })
        if (tryCPUSend(state, source, playerBases[0] as Base)) return
    }

    // 4. Upgrade if possible
    if (source && source.rank < 3) {
        const config = RANK_CONFIG[source.rank];
        const cost = config.upgradeCost;
        if (source.production >= cost + 20) { // Keep some production for defense
            upgradeBase(state, source.id)
        }
    }
}

export function tryCPUSend(state: GameState, source: Base, target: Base): boolean {
    if (!source || !target) return false
    const available = Math.floor(source.production * 0.5)
    const required = target.owner !== source.owner ? target.production + 5 : 0

    if (available >= required && available >= 1) {
        // A*パスから移動時間を推定し、到着時の残り体力を見積もる
        const path = findPath(state.mapGrid, source.x, source.y, target.x, target.y, 'cpu', source.rank)
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

        sendUnits(state, source.id, target.id, 0.5)
        return true
    }
    return false
}
