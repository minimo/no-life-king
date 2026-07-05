import { describe, expect, it } from 'vitest'
import { createMulberry32, hashString } from './random'

describe('random', () => {
    it('同一シードで同一乱数列を返す', () => {
        const a = createMulberry32(hashString('123456'))
        const b = createMulberry32(hashString('123456'))

        expect(Array.from({ length: 8 }, () => a())).toEqual(
            Array.from({ length: 8 }, () => b()),
        )
    })

    it('異なるシードでは異なる乱数列を返す', () => {
        const a = createMulberry32(hashString('123456'))
        const b = createMulberry32(hashString('654321'))

        expect(Array.from({ length: 4 }, () => a())).not.toEqual(
            Array.from({ length: 4 }, () => b()),
        )
    })
})
