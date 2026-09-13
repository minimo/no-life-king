import { GRID_MAX, LOGICAL_SIZE, TILE, TILE_PX, TILE_VARIANT } from './constants'
import type { Base } from '../types/game'
import { createBase } from './mapGenerator'
import { createHeightfield } from '../render/three/heightfield'
import { createLandscape, TERRAIN_CENTER } from '../render/three/landscape'

// Placement and navigation expand around the existing terrain and camera center.
export const PLAYABLE_SIZE = 1400
export const PLAYABLE_MIN = TERRAIN_CENTER - PLAYABLE_SIZE / 2
export const PLAYABLE_MAX = TERRAIN_CENTER + PLAYABLE_SIZE / 2
export const PLAYABLE_GRID_MIN = Math.ceil(PLAYABLE_MIN / TILE_PX)
export const PLAYABLE_GRID_MAX = Math.floor(PLAYABLE_MAX / TILE_PX)

const landscapes = new WeakMap<number[][], ReturnType<typeof createLandscape>>()
const outsideTiles = new WeakMap<number[][], Map<string, number>>()

export function getPlayableLandscape(grid: number[][]) {
    let landscape = landscapes.get(grid)
    if (!landscape) {
        landscape = createLandscape(grid, createHeightfield(grid, []))
        landscapes.set(grid, landscape)
    }
    return landscape
}

/** Keep the existing tiles, and sample the visible landscape beyond their edges. */
export function getPlayableTile(grid: number[][], gx: number, gy: number): number {
    if (gx >= 0 && gx <= GRID_MAX && gy >= 0 && gy <= GRID_MAX) return grid[gy]?.[gx] ?? TILE.GRASS
    let tiles = outsideTiles.get(grid)
    if (!tiles) {
        tiles = new Map()
        outsideTiles.set(grid, tiles)
    }
    const key = `${gx},${gy}`
    const cached = tiles.get(key)
    if (cached !== undefined) return cached
    const landscape = getPlayableLandscape(grid)
    const x = gx * TILE_PX, y = gy * TILE_PX
    const height = landscape.heightAt(x, y)
    // Include cell corners so routes keep a little clearance from the riverbank.
    const touchesWater = [[0, 0], [-8, -8], [-8, 8], [8, -8], [8, 8]]
        .some(([dx, dy]) => landscape.heightAt(x + dx!, y + dy!) <= 0)
    const tile = touchesWater ? TILE.WATER : height >= 130 ? TILE_VARIANT.HIGH_MOUNTAIN_MIN
        : height >= 72 ? TILE_VARIANT.LOW_MOUNTAIN_MIN : TILE.GRASS
    tiles.set(key, tile)
    return tile
}

/** Move the generated bases without regenerating, enlarging, or clearing the terrain. */
export function expandBasePlacement(grid: number[][], bases: Base[], targetCounts?: { forts: number; villages: number }): Base[] {
    if (bases.length === 0) return []
    // Only use land connected to the original battlefield, including its bridges.
    const width = PLAYABLE_GRID_MAX - PLAYABLE_GRID_MIN + 1
    const key = (x: number, y: number) => (y - PLAYABLE_GRID_MIN) * width + x - PLAYABLE_GRID_MIN
    const startX = Math.round(bases[0]!.x / TILE_PX), startY = Math.round(bases[0]!.y / TILE_PX)
    const reachable = new Set([key(startX, startY)])
    const queue = [{ x: startX, y: startY }]
    for (let i = 0; i < queue.length; i++) {
        const { x, y } = queue[i]!
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nx = x + dx!, ny = y + dy!
            if (nx < PLAYABLE_GRID_MIN || nx > PLAYABLE_GRID_MAX || ny < PLAYABLE_GRID_MIN || ny > PLAYABLE_GRID_MAX) continue
            const next = key(nx, ny)
            if (reachable.has(next) || getPlayableTile(grid, nx, ny) === TILE.WATER) continue
            reachable.add(next)
            queue.push({ x: nx, y: ny })
        }
    }
    const placed: Base[] = []
    const landscape = getPlayableLandscape(grid)
    const valid = (x: number, y: number, radius: number) => {
        if (x - radius < PLAYABLE_MIN || x + radius > PLAYABLE_MAX || y - radius < PLAYABLE_MIN || y + radius > PLAYABLE_MAX) return false
        if (placed.some(base => Math.hypot(base.x - x, base.y - y) < 100)) return false
        const gx = Math.round(x / TILE_PX), gy = Math.round(y / TILE_PX)
        if (!reachable.has(key(gx, gy))) return false
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const tile = getPlayableTile(grid, gx + dx, gy + dy)
            if (tile === TILE.WATER || tile === TILE.BRIDGE) return false
            if (tile === TILE.MOUNTAIN || tile >= TILE_VARIANT.LOW_MOUNTAIN_MIN && tile <= TILE_VARIANT.HIGH_MOUNTAIN_MAX) return false
            // Check the building footprint as well as the navigation tiles.
            if (landscape.heightAt(x + dx * radius, y + dy * radius) >= 72) return false
        }
        return true
    }
    for (const base of bases) {
        // Keep the original edge margins and building sizes in world units.
        const margin = base.isCore ? 48 : 100
        const scale = (PLAYABLE_SIZE - margin * 2) / (LOGICAL_SIZE - margin * 2)
        const x = PLAYABLE_MIN + margin + (base.x - margin) * scale
        const y = PLAYABLE_MIN + margin + (base.y - margin) * scale
        let position = valid(x, y, base.radius) ? { x, y } : undefined
        // Search nearby rings deterministically to avoid rivers and mountain slopes.
        for (let ring = 1; !position && ring <= Math.ceil(PLAYABLE_SIZE / TILE_PX); ring++) {
            for (let side = 0; side < 4 && !position; side++) for (let step = -ring; step < ring; step++) {
                const dx = side === 0 ? step : side === 1 ? ring : side === 2 ? -step : -ring
                const dy = side === 0 ? -ring : side === 1 ? step : side === 2 ? ring : -step
                const px = x + dx * TILE_PX, py = y + dy * TILE_PX
                if (valid(px, py, base.radius)) { position = { x: px, y: py }; break }
            }
        }
        if (!position) throw new Error(`No suitable lowland location available for base ${base.id}`)
        placed.push({ ...base, ...position })
    }

    if (targetCounts) {
        let fortCount = placed.filter(base => !base.isCore && base.owner === 'neutral' && base.rank === 2).length
        let villageCount = placed.filter(base => !base.isCore && base.owner === 'neutral' && base.rank === 1).length
        const fortsToAdd = Math.max(0, targetCounts.forts - fortCount)
        const totalToAdd = fortsToAdd + Math.max(0, targetCounts.villages - villageCount)
        const candidates: { x: number; y: number; clearance: number }[] = []
        const start = Math.ceil((PLAYABLE_MIN + 100) / TILE_PX) * TILE_PX
        for (let y = start; y <= PLAYABLE_MAX - 100; y += TILE_PX) for (let x = start; x <= PLAYABLE_MAX - 100; x += TILE_PX) {
            if (!valid(x, y, 16)) continue
            const clearance = Math.min(...placed.map(base => Math.hypot(base.x - x, base.y - y)))
            candidates.push({ x, y, clearance })
        }
        for (let i = 0; i < totalToAdd; i++) {
            // Fill the largest gap first, then update distances for the next addition.
            let best: typeof candidates[number] | undefined
            for (const candidate of candidates) {
                if (candidate.clearance >= 100 && (!best || candidate.clearance > best.clearance)) best = candidate
            }
            if (!best) throw new Error('Not enough reachable lowland for the requested base population')
            // Spread the stronger forts throughout the additions instead of placing them all first.
            const rank = Math.floor((i + 1) * fortsToAdd / totalToAdd) > Math.floor(i * fortsToAdd / totalToAdd) ? 2 : 1
            const id = rank === 2 ? `n-fort-added-${++fortCount}` : `n-vill-added-${++villageCount}`
            placed.push(createBase(id, 'neutral', rank, false, best.x, best.y, rank === 2 ? 50 : 10))
            for (const candidate of candidates) candidate.clearance = Math.min(candidate.clearance, Math.hypot(candidate.x - best.x, candidate.y - best.y))
        }
    }
    return placed
}
