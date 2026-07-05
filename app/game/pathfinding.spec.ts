import { describe, expect, it } from 'vitest'
import { TILE, TILE_PX } from './constants'
import { findPath } from './pathfinding'
import { getTileCost } from './terrain'

const createGrid = () => Array(53).fill(0).map(() => Array(53).fill(TILE.GRASS))

describe('pathfinding', () => {
    it('水タイルを迂回する', () => {
        const grid = createGrid()
        grid[0]![1] = TILE.WATER
        grid[0]![2] = TILE.WATER
        grid[0]![3] = TILE.WATER

        const path = findPath(grid, 0, 0, 4 * TILE_PX, 0, 'player', 1)

        expect(path.length).toBeGreaterThan(2)
        expect(path).not.toEqual([{ x: 0, y: 0 }, { x: 4 * TILE_PX, y: 0 }])
    })

    it('Rank3 は水を渡れる', () => {
        const grid = createGrid()
        grid[0]![1] = TILE.WATER

        expect(getTileCost(grid, 1, 0, 'player', 3)).toBe(2)
        expect(findPath(grid, 0, 0, TILE_PX, 0, 'player', 3)).toEqual([
            { x: 0, y: 0 },
            { x: TILE_PX, y: 0 },
        ])
    })

    it('右端列付近でもキー衝突せずに経路を復元する', () => {
        const grid = createGrid()
        for (let y = 8; y <= 11; y++) {
            grid[y]![51] = TILE.WATER
        }

        const path = findPath(grid, 50 * TILE_PX, 10 * TILE_PX, 52 * TILE_PX, 10 * TILE_PX, 'player', 1)

        expect(path).not.toEqual([
            { x: 50 * TILE_PX, y: 10 * TILE_PX },
            { x: 52 * TILE_PX, y: 10 * TILE_PX },
        ])
        expect(path).toContainEqual({ x: 51 * TILE_PX, y: 12 * TILE_PX })
        expect(path.at(-1)).toEqual({ x: 52 * TILE_PX, y: 10 * TILE_PX })
    })
})
