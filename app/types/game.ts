export type Owner = 'player' | 'cpu' | 'neutral'
export type Rank = 1 | 2 | 3

export interface Point {
    x: number
    y: number
}

export interface Base {
    id: string
    owner: Owner
    rank: Rank
    production: number
    productionCap: number
    growthRate: number
    isCore: boolean
    /** Temporary fort created by a unit. It disappears instead of changing owner. */
    isCamp?: boolean
    x: number
    y: number
    radius: number
    currentZoneRadius: number
}

export type UnitOrder = 'base' | 'camp' | 'wait'

export interface Unit {
    id: string
    owner: Owner
    sourceId: string
    targetId: string
    order?: UnitOrder
    destination?: Point
    power: number
    path: Point[]
    pathIndex: number
    x: number
    y: number
    elapsedTime: number
    isFighting?: boolean
    fightingTargetId?: string | null
    pursuitTargetId?: string | null
    isStopped?: boolean
    rank: Rank
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
    seed: string
}
