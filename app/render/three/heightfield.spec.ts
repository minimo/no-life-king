import { describe, expect, it } from 'vitest'
import { generateMap } from '../../game/mapGenerator'
import { createMulberry32, hashString } from '../../game/random'
import { BRIDGE_HEIGHT, createHeightfield, MAP_MIN, MESH_STEP, WATER_HEIGHT } from './heightfield'

describe('3D terrain elevation', () => {
    it('preserves the map and bases and generates the same elevation for the same seed', () => {
        const { mapGrid, bases } = generateMap(createMulberry32(hashString('123456')))
        const before = JSON.stringify({ mapGrid, bases })
        const a = createHeightfield(mapGrid, bases)
        const b = createHeightfield(mapGrid, bases)
        expect(a.heights).toEqual(b.heights)
        expect(JSON.stringify({ mapGrid, bases })).toBe(before)
        expect(Math.max(...a.heights) - Math.min(...a.heights)).toBeGreaterThan(25)
    })

    it('places crossing units on water or the bridge deck and flattens fort foundations', () => {
        const { mapGrid, bases } = generateMap(createMulberry32(hashString('123456')))
        const field = createHeightfield(mapGrid, bases)
        mapGrid.forEach((row, y) => row.forEach((tile, x) => {
            if (tile === 1) expect(field.surfaceAt(x * 16, y * 16)).toBe(WATER_HEIGHT)
            if (tile === 4) expect(field.surfaceAt(x * 16, y * 16)).toBe(BRIDGE_HEIGHT)
        }))
        for (const base of bases.filter(b => b.isCore)) {
            expect(field.heightAt(base.x + 8, base.y)).toBeCloseTo(field.heightAt(base.x, base.y), 4)
        }
    })

    it('keeps soldiers on the sloped bridge approach instead of below its deck', () => {
        const grid = Array.from({ length: 7 }, () => Array<number>(7).fill(0))
        grid[3]!.fill(1)
        grid[3]![3] = 4
        const field = createHeightfield(grid, [])
        const bank = field.heightAt(48, 64)
        expect(field.surfaceAt(48, 56)).toBeCloseTo(BRIDGE_HEIGHT)
        expect(field.surfaceAt(48, 60)).toBeCloseTo((BRIDGE_HEIGHT + bank) / 2)
        expect(field.surfaceAt(48, 64)).toBeCloseTo(bank)
    })

    it('samples exactly on both rendered triangles, including outside the map edge', () => {
        const { mapGrid, bases } = generateMap(createMulberry32(hashString('terrain-test')))
        const field = createHeightfield(mapGrid, bases)
        for (let j = 0; j < field.size - 1; j += 7) for (let i = 0; i < field.size - 1; i += 7) {
            const a = field.heights[j * field.size + i]!, b = field.heights[j * field.size + i + 1]!
            const c = field.heights[(j + 1) * field.size + i]!, d = field.heights[(j + 1) * field.size + i + 1]!
            const x = MAP_MIN + i * MESH_STEP, y = MAP_MIN + j * MESH_STEP
            expect(field.heightAt(x + MESH_STEP / 3, y + MESH_STEP / 3)).toBeCloseTo((a + b + c) / 3, 5)
            expect(field.heightAt(x + MESH_STEP * 2 / 3, y + MESH_STEP * 2 / 3)).toBeCloseTo((b + c + d) / 3, 5)
        }
        expect(Number.isFinite(field.surfaceAt(-1000, 3000))).toBe(true)
    })
})
