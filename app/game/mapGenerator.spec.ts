import { describe, expect, it } from 'vitest'
import { generateMap } from './mapGenerator'
import { createMulberry32, hashString } from './random'

describe('mapGenerator', () => {
    it('シード123456で同じマップ要約値を生成する', () => {
        const rnd = createMulberry32(hashString('123456'))
        rnd() // initGame の cpuThinkingTimer と同じPRNG消費を再現

        const { mapGrid, bases } = generateMap(rnd)
        const flat = mapGrid.flat()
        const counts = flat.reduce<Record<string, number>>((acc, value) => {
            acc[value] = (acc[value] ?? 0) + 1
            return acc
        }, {})

        expect({
            jsonLength: JSON.stringify(mapGrid).length,
            sum: flat.reduce((acc, value) => acc + value, 0),
            counts,
            bases: bases.map(({ id, owner, rank, isCore, x, y, production }) => ({
                id,
                owner,
                rank,
                isCore,
                x: Number(x.toFixed(6)),
                y: Number(y.toFixed(6)),
                production,
            })),
        }).toEqual({
            jsonLength: 6401,
            sum: 20172,
            counts: {
                0: 1984,
                1: 141,
                4: 8,
                21: 73,
                22: 78,
                23: 49,
                24: 46,
                31: 2,
                32: 55,
                33: 114,
                34: 130,
                35: 129,
            },
            bases: [
                { id: 'p-core', owner: 'player', rank: 1, isCore: true, x: 48, y: 784, production: 20 },
                { id: 'c-core', owner: 'cpu', rank: 1, isCore: true, x: 784, y: 48, production: 20 },
                { id: 'n-fort-lu', owner: 'neutral', rank: 2, isCore: false, x: 100, y: 100, production: 50 },
                { id: 'n-fort-rd', owner: 'neutral', rank: 2, isCore: false, x: 732, y: 732, production: 50 },
                { id: 'n-vill-4', owner: 'neutral', rank: 1, isCore: false, x: 350.942928, y: 515.419356, production: 10 },
                { id: 'n-vill-5', owner: 'neutral', rank: 1, isCore: false, x: 457.258383, y: 528.691839, production: 10 },
                { id: 'n-vill-6', owner: 'neutral', rank: 1, isCore: false, x: 535.847126, y: 162.127085, production: 10 },
                { id: 'n-vill-7', owner: 'neutral', rank: 1, isCore: false, x: 583.22911, y: 647.562189, production: 10 },
                { id: 'n-vill-8', owner: 'neutral', rank: 1, isCore: false, x: 137.74522, y: 233.261241, production: 10 },
                { id: 'n-vill-9', owner: 'neutral', rank: 1, isCore: false, x: 285.375088, y: 301.784459, production: 10 },
                { id: 'n-vill-10', owner: 'neutral', rank: 1, isCore: false, x: 719.594537, y: 455.151884, production: 10 },
                { id: 'n-vill-11', owner: 'neutral', rank: 1, isCore: false, x: 687.317203, y: 627.362772, production: 10 },
            ],
        })
    })
})
