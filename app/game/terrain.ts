import { GRID_MAX, TILE, TILE_PX, TILE_VARIANT } from './constants'
import type { Base, Rank } from '../types/game'

/** ユニット現在位置の地形タイルから速度倍率を返す */
export function getTerrainSpeedMultiplier(mapGrid: number[][], worldX: number, worldY: number, bases: Base[], rank: Rank): number {
    const gx = Math.round(worldX / TILE_PX)
    const gy = Math.round(worldY / TILE_PX)
    if (gy < 0 || gy > GRID_MAX || gx < 0 || gx > GRID_MAX) return 1.0
    const tile = mapGrid[gy]?.[gx] ?? TILE.GRASS

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
    if (tile === TILE.WATER) {
        if (rank === 3) mult = 0.5 // 金色ユニットは水上を0.5倍速で移動可能
        else mult = 0.0 // 侵入不可
    }
    // 橋
    else if (tile === TILE.BRIDGE) { mult = 1.0 }
    // 低山 (21-22)
    else if (tile === TILE_VARIANT.LOW_MOUNTAIN_MIN || tile === TILE_VARIANT.LOW_MOUNTAIN_MAX) { mult = 0.5 }
    // 高山 (23-24)
    else if (tile === TILE_VARIANT.HIGH_MOUNTAIN_MIN || tile === TILE_VARIANT.HIGH_MOUNTAIN_MAX) { mult = 0.35 }
    // 木・疎 (31-33)
    else if (tile >= TILE_VARIANT.WOOD_SPARSE_MIN && tile <= TILE_VARIANT.WOOD_SPARSE_MAX) { mult = 0.85 }
    // 木・密 (34-35)
    else if (tile === TILE_VARIANT.WOOD_DENSE_MIN || tile === TILE_VARIANT.WOOD_DENSE_MAX) { mult = 0.7 }

    // 砦の影響範囲内ならペナルティを50%軽減（倍率を1.0に寄せる）
    if (inZone && mult < 1.0) {
        mult = mult + (1.0 - mult) * 0.5
    }

    return mult
}

/** グリッドタイルの移動コストを返す（速度倍率の逆数）*/
export function getTileCost(mapGrid: number[][], gx: number, gy: number, rank: Rank): number {
    if (gy < 0 || gy > GRID_MAX || gx < 0 || gx > GRID_MAX) return 1.0
    const tile = mapGrid[gy]?.[gx] ?? TILE.GRASS
    if (tile === TILE.WATER) {
        // 金色ユニット (Rank 3) は水を渡れる（コスト高め = 速度0.5倍）
        if (rank === 3) return 2.0
        return Infinity // 水（侵入不可）
    }
    if (tile === TILE.BRIDGE) return 1.0 // 橋
    if (tile === TILE_VARIANT.LOW_MOUNTAIN_MIN || tile === TILE_VARIANT.LOW_MOUNTAIN_MAX) return 2.0 // 低山
    if (tile === TILE_VARIANT.HIGH_MOUNTAIN_MIN || tile === TILE_VARIANT.HIGH_MOUNTAIN_MAX) return 2.86 // 高山
    if (tile >= TILE_VARIANT.WOOD_SPARSE_MIN && tile <= TILE_VARIANT.WOOD_SPARSE_MAX) return 1.18 // 木・疎
    if (tile === TILE_VARIANT.WOOD_DENSE_MIN || tile === TILE_VARIANT.WOOD_DENSE_MAX) return 1.43 // 木・密
    return 1.0
}
