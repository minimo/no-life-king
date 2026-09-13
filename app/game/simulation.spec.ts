import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../stores/game'
import { establishBaseCamp, updateSimulation } from './simulation'
import type { Base, Unit } from '../types/game'

describe('open-ground unit orders', () => {
    beforeEach(() => setActivePinia(createPinia()))

    const setup = () => {
        const store = useGameStore()
        store.startGame('123456')
        return store
    }

    it('turns the arriving force into a rank-2 base camp capped at 50', () => {
        const store = setup()
        const source = store.bases.find(base => base.owner === 'player')!
        const destination = { x: source.x + 80, y: source.y + 80 }
        source.production = 160
        store.sendUnitsToPoint(source.id, destination, 'camp', 0.5)
        const unit = store.units[0]!
        unit.x = destination.x
        unit.y = destination.y
        unit.pathIndex = unit.path.length - 1

        updateSimulation(store, 0)

        expect(store.units).toHaveLength(0)
        expect(store.bases.at(-1)).toMatchObject({
            owner: 'player',
            rank: 2,
            isCamp: true,
            production: 50,
            productionCap: 50,
            ...destination,
        })
    })

    it('halves natural power decay while a unit waits and keeps it in place', () => {
        const store = setup()
        store.bases = []
        const unit: Unit = {
            id: 'waiting', owner: 'player', sourceId: '', targetId: '', order: 'wait',
            destination: { x: 0, y: 0 }, power: 10, path: [{ x: 0, y: 0 }], pathIndex: 0,
            x: 0, y: 0, elapsedTime: 2, isStopped: true, rank: 1,
        }
        store.units = [unit]

        updateSimulation(store, 1)

        expect(unit.power).toBeCloseTo(9.5)
        expect({ x: unit.x, y: unit.y }).toEqual({ x: 0, y: 0 })
    })

    it('removes a destroyed camp and sends surviving attackers to their nearest permanent fort', () => {
        const store = setup()
        const cpuBases = store.bases.filter(base => base.owner === 'cpu' && !base.isCamp)
        const nearHome = cpuBases[0]!
        const farHome: Base = { ...nearHome, id: 'far-home', x: nearHome.x + 500, y: nearHome.y + 500 }
        store.bases.push(farHome)
        const attacker: Unit = {
            id: 'attacker', owner: 'cpu', sourceId: farHome.id, targetId: '', order: 'base',
            power: 30, path: [], pathIndex: 0, x: nearHome.x + 10, y: nearHome.y + 10,
            elapsedTime: 0, rank: 1,
        }
        const camp = establishBaseCamp(store, {
            ...attacker,
            id: 'builder', owner: 'player', power: 10,
            destination: { x: attacker.x, y: attacker.y },
        })
        attacker.targetId = camp.id
        attacker.path = [{ x: attacker.x, y: attacker.y }]
        store.units = [attacker]

        updateSimulation(store, 0)

        expect(store.bases).not.toContain(camp)
        expect(attacker.power).toBe(20)
        expect(attacker.targetId).toBe(nearHome.id)
        expect(attacker.order).toBe('base')
        expect(store.units.some(unit => unit.id === attacker.id)).toBe(true)
    })
})
