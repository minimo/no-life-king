import { createNoise2D } from 'simplex-noise'
import { createMulberry32, hashString } from '../../game/random'
import { TILE, TILE_PX } from '../../game/constants'
import { MAP_MIN, MAP_MAX, type Heightfield } from './heightfield'

// Fix the full landscape width at 3,300, independently of the battlefield size.
export const LANDSCAPE_RADIUS = 1650
export const TERRAIN_CENTER = (MAP_MIN + MAP_MAX) / 2
export const smooth = (a: number, b: number, value: number) => {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)))
    return t * t * (3 - 2 * t)
}

export function createLandscape(grid: number[][], field: Heightfield) {
    const noise = createNoise2D(createMulberry32(hashString(JSON.stringify(grid)) ^ 0x62a5b39))
    const mouths: { x: number; y: number; dx: number; dy: number; width: number }[] = []
    const n = grid.length
    for (let side = 0; side < 4; side++) {
        let start = -1
        for (let i = 0; i <= n; i++) {
            const tile = side === 0 ? grid[0]?.[i] : side === 1 ? grid[n - 1]?.[i] : side === 2 ? grid[i]?.[0] : grid[i]?.[n - 1]
            const river = i < n && (tile === TILE.WATER || tile === TILE.BRIDGE)
            if (river && start < 0) start = i
            if (!river && start >= 0) {
                const middle = (start + i - 1) * TILE_PX / 2
                mouths.push({ x: side < 2 ? middle : side === 2 ? MAP_MIN : MAP_MAX, y: side >= 2 ? middle : side === 0 ? MAP_MIN : MAP_MAX,
                    dx: side === 2 ? -1 : side === 3 ? 1 : 0, dy: side === 0 ? -1 : side === 1 ? 1 : 0, width: (i - start) * TILE_PX / 2 })
                start = -1
            }
        }
    }
    const inside = (x: number, y: number) => x >= MAP_MIN && x <= MAP_MAX && y >= MAP_MIN && y <= MAP_MAX
    const distanceOutside = (x: number, y: number) => Math.hypot(Math.max(MAP_MIN - x, 0, x - MAP_MAX), Math.max(MAP_MIN - y, 0, y - MAP_MAX))
    const heightAt = (x: number, y: number) => {
        if (inside(x, y)) return field.heightAt(x, y)
        const distance = distanceOutside(x, y)
        const warpX = x + noise(x * .0012, y * .0012) * 160
        const warpY = y + noise(x * .0012 + 60, y * .0012) * 160
        const ridgeNoise = noise(warpX * .0013, warpY * .0013)
        const ridge = 1 - ridgeNoise * ridgeNoise
        const mountain = Math.pow(ridge, 3) * (85 + 320 * smooth(250, 1800, distance))
        let h = 18 + mountain + noise(x * .003, y * .003) * 20 + noise(x * .008, y * .008) * 4
        h = Math.max(8, h)
        // Rivers continue out of the battlefield, meandering through the wider valley.
        for (const mouth of mouths) {
            const along = (x - mouth.x) * mouth.dx + (y - mouth.y) * mouth.dy
            if (along < 0) continue
            const across = (x - mouth.x) * -mouth.dy + (y - mouth.y) * mouth.dx
            const meander = noise(along * .0015, mouth.x * .013 + mouth.y * .017) * Math.min(110, along * .2)
            const width = mouth.width + Math.min(28, along * .012)
            const bank = Math.abs(across - meander) - width
            const riverbed = Math.max(-6, bank * .6)
            h = Math.min(h, riverbed + h * smooth(4, 110, bank))
        }
        const boundary = field.heightAt(Math.max(MAP_MIN, Math.min(MAP_MAX, x)), Math.max(MAP_MIN, Math.min(MAP_MAX, y)))
        return boundary + (h - boundary) * smooth(0, 200, distance)
    }
    return { noise, inside, distanceOutside, heightAt,
        surfaceAt: (x: number, y: number) => inside(x, y) ? field.surfaceAt(x, y) : Math.max(0, heightAt(x, y)),
    }
}
