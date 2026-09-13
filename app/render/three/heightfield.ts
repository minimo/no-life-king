import { LOGICAL_SIZE, TILE, TILE_PX } from '../../game/constants'
import type { Base } from '../../types/game'

export const WATER_HEIGHT = 0
export const BRIDGE_HEIGHT = 4
export const MESH_STEP = TILE_PX / 4
export const MAP_MIN = -TILE_PX / 2
export const MAP_MAX = LOGICAL_SIZE + TILE_PX / 2

/** Rendering-only elevation. Never modifies the map or movement costs. */
export function createHeightfield(grid: number[][], bases: Base[]) {
    const tileAt = (x: number, y: number) => grid[Math.max(0, Math.min(grid.length - 1, Math.round(y / TILE_PX)))]?.[Math.max(0, Math.min(grid.length - 1, Math.round(x / TILE_PX)))] ?? TILE.GRASS
    const raw = (x: number, y: number) => {
        const tile = tileAt(x, y)
        if (tile === TILE.WATER || tile === TILE.BRIDGE) return -3
        let mountain = 0
        let weight = 0
        let riverDistance = Infinity
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
            const gx = Math.round(x / TILE_PX) + dx
            const gy = Math.round(y / TILE_PX) + dy
            const t = grid[gy]?.[gx] ?? 0
            const d = Math.hypot(x / TILE_PX - gx, y / TILE_PX - gy)
            const w = Math.max(0, 3 - d)
            mountain += (t >= 23 && t <= 24 ? 60 : t === 2 || t >= 21 && t <= 22 ? 32 : 0) * w
            weight += w
            if (t === TILE.WATER || t === TILE.BRIDGE) riverDistance = Math.min(riverDistance, d)
        }
        const rolling = 7 + 3 * Math.sin(x * .014) * Math.cos(y * .012)
        const height = rolling + mountain / Math.max(1, weight)
        return Math.min(height, 2 + Math.max(0, riverDistance - .5) * 12)
    }
    const foundations = bases.map(base => ({ x: base.x, y: base.y, height: Math.max(5, raw(base.x, base.y)) }))
    const size = Math.round((MAP_MAX - MAP_MIN) / MESH_STEP) + 1
    const heights = new Float32Array(size * size)
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        const x = MAP_MIN + i * MESH_STEP, y = MAP_MIN + j * MESH_STEP
        let h = raw(x, y)
        if (tileAt(x, y) !== TILE.WATER && tileAt(x, y) !== TILE.BRIDGE) {
            for (const base of foundations) {
                const blend = Math.max(0, Math.min(1, (48 - Math.hypot(x - base.x, y - base.y)) / 20))
                h += (base.height - h) * blend
            }
        }
        heights[j * size + i] = h
    }
    const heightAt = (x: number, y: number) => {
        const gx = Math.max(0, Math.min(size - 1.000001, (x - MAP_MIN) / MESH_STEP))
        const gy = Math.max(0, Math.min(size - 1.000001, (y - MAP_MIN) / MESH_STEP))
        const i = Math.floor(gx), j = Math.floor(gy), u = gx - i, v = gy - j
        const a = heights[j * size + i]!, b = heights[j * size + i + 1]!
        const c = heights[(j + 1) * size + i]!, d = heights[(j + 1) * size + i + 1]!
        // Match the two triangles used by the terrain mesh exactly.
        return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v)
    }
    const ramps: { x: number; y: number; alongY: boolean; direction: number; bankHeight: number }[] = []
    grid.forEach((row, j) => row.forEach((tile, i) => {
        if (tile !== TILE.BRIDGE) return
        const alongY = grid[j]?.[i - 1] === TILE.WATER || grid[j]?.[i + 1] === TILE.WATER
        for (const direction of [-1, 1]) {
            const gx = alongY ? i : i + direction, gy = alongY ? j + direction : j
            const neighbor = grid[gy]?.[gx]
            if (neighbor !== undefined && neighbor !== TILE.BRIDGE && neighbor !== TILE.WATER) {
                ramps.push({ x: i * TILE_PX, y: j * TILE_PX, alongY, direction, bankHeight: heightAt(gx * TILE_PX, gy * TILE_PX) })
            }
        }
    }))
    const surfaceAt = (x: number, y: number) => {
        const tile = tileAt(x, y)
        if (tile === TILE.BRIDGE) return BRIDGE_HEIGHT
        if (tile === TILE.WATER) return WATER_HEIGHT
        let h = Math.max(WATER_HEIGHT, heightAt(x, y))
        for (const ramp of ramps) {
            const along = (ramp.alongY ? y - ramp.y : x - ramp.x) * ramp.direction
            const across = Math.abs(ramp.alongY ? x - ramp.x : y - ramp.y)
            if (along >= 8 && along <= 16 && across <= 7) {
                h = Math.max(h, BRIDGE_HEIGHT + (ramp.bankHeight - BRIDGE_HEIGHT) * (along - 8) / 8)
            }
        }
        return h
    }
    return { size, heights, heightAt, surfaceAt, tileAt }
}
export type Heightfield = ReturnType<typeof createHeightfield>
