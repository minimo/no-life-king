import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../stores/game'
import { useGameInput } from './useGameInput'

const event = (x = 0, y = 0) => ({ clientX: x, clientY: y, stopPropagation: vi.fn() }) as unknown as PointerEvent

describe('3D world input preserves game commands', () => {
    beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })
    const setup = () => {
        const store = useGameStore()
        store.startGame('123456')
        return { store, input: useGameInput(store) }
    }
    it('uses raycast world coordinates for drag sending and preserves the send ratio', async () => {
        const { store, input } = setup()
        const source = store.bases.find(b => b.id === 'p-core')!, target = store.bases.find(b => b.id === 'n-vill-8')!
        const send = vi.spyOn(store, 'sendUnits')
        input.handleBasePointerDown(source, event(100, 100))
        input.setWorldPointer(target)
        expect(input.targetedBaseId.value).toBe(target.id)
        await input.handleGlobalPointerUp(event(300, 200))
        expect(send).toHaveBeenCalledWith(source.id, target.id)
        expect(store.units).toHaveLength(1)
        expect(store.units[0]!.power).toBe(10)
        expect(source.production).toBe(10)
        input.reset()
    })
    it('double-clicking a target sends from all player bases', async () => {
        const { store, input } = setup()
        const target = store.bases.find(b => b.owner === 'neutral')!
        const second = store.bases.find(b => b.id === 'n-vill-8')!
        second.owner = 'player'
        const send = vi.spyOn(store, 'sendUnits')
        input.setWorldPointer(target)
        input.handleBasePointerDown(target, event())
        await input.handleGlobalPointerUp(event())
        vi.advanceTimersByTime(100)
        input.handleBasePointerDown(target, event())
        await input.handleGlobalPointerUp(event())
        expect(send).toHaveBeenCalledTimes(2)
        input.reset()
    })
    it('long press pauses, upgrades, and resumes; resetting cancels pending menus', async () => {
        const { store, input } = setup()
        const base = store.bases[0]!
        base.production = 100
        input.handleBasePointerDown(base, event())
        await vi.advanceTimersByTimeAsync(500)
        expect(store.status).toBe('paused')
        expect(input.contextMenu.value.visible).toBe(true)
        input.handleContextMenuAction('upgrade')
        expect(base.rank).toBe(2)
        expect(store.status).toBe('playing')
        input.reset()
        input.handleBasePointerDown(base, event())
        input.reset()
        await vi.advanceTimersByTimeAsync(600)
        expect(input.contextMenu.value.visible).toBe(false)
    })
    it('redirects and stops existing units through the same commands', async () => {
        const { store, input } = setup()
        store.sendUnits('p-core', 'n-vill-8')
        const unit = store.units[0]!, target = store.bases.find(b => b.id === 'n-vill-9')!
        const redirect = vi.spyOn(store, 'redirectUnit')
        input.handleUnitPointerDown(unit, event())
        input.setWorldPointer(target)
        await input.handleGlobalPointerUp(event(200, 200))
        expect(redirect).toHaveBeenCalledWith(unit.id, target.id)
        input.handleUnitPointerDown(unit, event())
        await vi.advanceTimersByTimeAsync(500)
        input.handleContextMenuAction('stop')
        expect(unit.isStopped).toBe(true)
        expect(store.status).toBe('playing')
        input.reset()
    })
})
