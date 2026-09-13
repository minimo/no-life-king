import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../stores/game'
import { GRID_SIZE, LOGICAL_SIZE, TILE, TILE_PX } from './constants'
import { createBase, generateMap } from './mapGenerator'
import { createMulberry32, hashString } from './random'
import { getTileCost } from './terrain'
import { expandBasePlacement, getPlayableLandscape, getPlayableTile, PLAYABLE_MIN, PLAYABLE_MAX, PLAYABLE_SIZE } from './playableArea'

describe('expanded base placement on the existing landscape', () => {
    it('keeps the original terrain and bases, and fills the playable area with 26 reachable bases', () => {
        setActivePinia(createPinia())
        const game = useGameStore()
        game.initGame('123456')
        const random = createMulberry32(hashString('123456'))
        random() // The store consumes one random value for its CPU timer.
        const original = generateMap(random)

        expect(game.mapGrid).toEqual(original.mapGrid)
        expect(game.mapGrid).toHaveLength(GRID_SIZE)
        expect(LOGICAL_SIZE).toBe(832)
        expect(PLAYABLE_SIZE).toBe(1400)
        expect([PLAYABLE_MIN, PLAYABLE_MAX]).toEqual([-284, 1116])
        const roster = (bases: typeof original.bases) => bases.map(({ x, y, ...base }) => base)
        expect(roster(game.bases.slice(0, original.bases.length))).toEqual(roster(original.bases))
        expect(game.bases).toHaveLength(26)
        expect(game.bases.filter(base => base.isCore)).toHaveLength(2)
        expect(game.bases.filter(base => base.owner === 'neutral' && base.rank === 2)).toHaveLength(3)
        expect(game.bases.filter(base => base.owner === 'neutral' && base.rank === 1)).toHaveLength(21)
        expect(new Set(game.bases.map(base => base.id)).size).toBe(26)
        for (const base of game.bases.slice(original.bases.length)) {
            expect(base.production).toBe(base.rank === 2 ? 50 : 10)
        }

        const nearestAverage = (bases: typeof original.bases) => bases.reduce((sum, base) => sum + Math.min(...bases.filter(other => other !== base).map(other => Math.hypot(base.x - other.x, base.y - other.y))), 0) / bases.length
        expect(nearestAverage(game.bases)).toBeLessThan(nearestAverage(game.bases.slice(0, original.bases.length)))
        expect(game.bases.some(base => base.x < 0)).toBe(true)
        expect(game.bases.some(base => base.x > LOGICAL_SIZE)).toBe(true)
        expect(game.bases.some(base => base.y < 0)).toBe(true)
        expect(game.bases.some(base => base.y > LOGICAL_SIZE)).toBe(true)

        for (const [index, base] of game.bases.entries()) {
            for (const coordinate of [base.x, base.y]) {
                expect(coordinate - base.radius).toBeGreaterThanOrEqual(PLAYABLE_MIN)
                expect(coordinate + base.radius).toBeLessThanOrEqual(PLAYABLE_MAX)
            }
            for (const other of game.bases.slice(index + 1)) expect(Math.hypot(base.x - other.x, base.y - other.y)).toBeGreaterThanOrEqual(100)
            const gx = Math.round(base.x / TILE_PX), gy = Math.round(base.y / TILE_PX)
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                expect([TILE.WATER, TILE.BRIDGE, TILE.MOUNTAIN, 21, 22, 23, 24]).not.toContain(getPlayableTile(game.mapGrid, gx + dx, gy + dy))
                expect(getPlayableLandscape(game.mapGrid).heightAt(base.x + dx * base.radius, base.y + dy * base.radius)).toBeLessThan(72)
            }
        }

        const source = game.bases[0]!
        for (const target of game.bases.slice(1)) {
            const path = game.getPath(source.x, source.y, target.x, target.y, 1)
            expect(path[0]).toEqual({ x: source.x, y: source.y })
            expect(path.at(-1)).toEqual({ x: target.x, y: target.y })
            for (let i = 1; i < path.length; i++) {
                const from = path[i - 1]!, to = path[i]!
                const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4)
                for (let step = 0; step <= steps; step++) {
                    const x = from.x + (to.x - from.x) * step / steps
                    const y = from.y + (to.y - from.y) * step / steps
                    expect(Number.isFinite(getTileCost(game.mapGrid, Math.round(x / TILE_PX), Math.round(y / TILE_PX), 1)), `${target.id}: ${JSON.stringify(from)} -> ${JSON.stringify(to)} at ${x},${y}`).toBe(true)
                }
            }
        }
    })

    it.each(['654321', 'terrain-test'])('places bases deterministically on dry lowland for seed %s', seed => {
        const { mapGrid, bases } = generateMap(createMulberry32(hashString(seed)))
        const before = JSON.stringify({ mapGrid, bases })
        const counts = { forts: 3, villages: 21 }
        const placed = expandBasePlacement(mapGrid, bases, counts)
        expect(expandBasePlacement(mapGrid, bases, counts)).toEqual(placed)
        expect(placed).toHaveLength(26)
        expect(JSON.stringify({ mapGrid, bases })).toBe(before)
        const landscape = getPlayableLandscape(mapGrid)
        for (const base of placed) {
            if (!landscape.inside(base.x, base.y)) expect(landscape.heightAt(base.x, base.y)).toBeGreaterThan(0)
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                expect(landscape.heightAt(base.x + dx * base.radius, base.y + dy * base.radius)).toBeLessThan(72)
            }
        }
    })

    it('relocates a mountain candidate onto lowland without clearing the mountain', () => {
        const grid = Array.from({ length: GRID_SIZE }, () => Array<number>(GRID_SIZE).fill(TILE.GRASS))
        for (let y = 22; y <= 30; y++) for (let x = 22; x <= 30; x++) grid[y]![x] = 23
        const original = JSON.stringify(grid)
        const landscape = getPlayableLandscape(grid)
        expect(landscape.heightAt(416, 416)).toBeGreaterThanOrEqual(72)
        const [base] = expandBasePlacement(grid, [createBase('fort', 'neutral', 2, false, 416, 416)])
        expect(base).toBeDefined()
        expect({ x: base!.x, y: base!.y }).not.toEqual({ x: 416, y: 416 })
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            expect(landscape.heightAt(base!.x + dx * base!.radius, base!.y + dy * base!.radius)).toBeLessThan(72)
        }
        expect(JSON.stringify(grid)).toBe(original)
    })
})
