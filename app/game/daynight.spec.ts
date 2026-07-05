import { describe, expect, it } from 'vitest'
import { getNightAlpha, getNightTint, getTimeDecayMultiplier, getTimeSpeedMultiplier, isDaytime } from './daynight'

describe('daynight', () => {
    it('昼夜境界を判定する', () => {
        expect(isDaytime(360)).toBe(true)
        expect(isDaytime(1020)).toBe(true)
        expect(isDaytime(1080)).toBe(false)
        expect(isDaytime(300)).toBe(false)
    })

    it('時間帯ごとの速度倍率を返す', () => {
        expect(getTimeSpeedMultiplier('cpu', 360)).toBe(0.6)
        expect(getTimeSpeedMultiplier('cpu', 1080)).toBe(1.0)
        expect(getTimeSpeedMultiplier('player', 1080)).toBe(0.75)
        expect(getTimeSpeedMultiplier('player', 300)).toBe(0.75)
    })

    it('時間帯ごとの防御力消費倍率を返す', () => {
        expect(getTimeDecayMultiplier('cpu', 360)).toBe(1.5)
        expect(getTimeDecayMultiplier('cpu', 1080)).toBe(1.0)
        expect(getTimeDecayMultiplier('player', 1080)).toBe(1.3)
        expect(getTimeDecayMultiplier('player', 360)).toBe(1.0)
    })

    it('夜間表示の境界値を返す', () => {
        expect(getNightAlpha(360)).toBe(0)
        expect(getNightAlpha(1020)).toBe(0)
        expect(getNightAlpha(1080)).toBe(0.5)
        expect(getNightAlpha(300)).toBe(0.5)
        expect(getNightTint(360)).toBe(0xffffff)
    })
})
