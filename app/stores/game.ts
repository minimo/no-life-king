import { defineStore } from 'pinia'
import { checkGameOver as checkGameOverLogic, redirectUnit as redirectUnitLogic, resolveCombat as resolveCombatLogic, sendUnits as sendUnitsLogic, stopUnit as stopUnitLogic, updateSimulation, upgradeBase as upgradeBaseLogic } from '~/game/simulation'
import { createBase as createBaseLogic, generateMap } from '~/game/mapGenerator'
import { createMulberry32, hashString } from '~/game/random'
import { executeCPUAction as executeCPUActionLogic, tryCPUSend as tryCPUSendLogic, updateCPU as updateCPULogic } from '~/game/cpu'
import { findPath } from '~/game/pathfinding'
import type { Base, GameState, Owner, Rank, Unit } from '~/types/game'

export const useGameStore = defineStore('game', {
    state: (): GameState => ({
        mapGrid: [], // 51x51 grid (0: Grass, 1: Water, 2: Mountain, 3: Wood, 4: Bridge)
        bases: [],
        units: [],
        sendRatio: 0.5,
        isGameOver: false,
        winner: null,
        targetSelectThreshold: 40,
        cpuThinkingTimer: 0,
        dayTime: 360, // 6:00 AM (6 * 60)
        status: 'title',
        seed: '',
    }),

    actions: {
        initGame(customSeed?: string): void {
            if (customSeed) {
                this.seed = customSeed
            } else if (!this.seed) {
                // Generate random 6-digit number string
                this.seed = Math.floor(100000 + Math.random() * 900000).toString()
            }

            const seedNum = hashString(this.seed)
            const rnd = createMulberry32(seedNum)

            this.bases = []
            this.units = []
            this.isGameOver = false
            this.winner = null
            this.cpuThinkingTimer = rnd() * 1.0 + 0.5
            this.dayTime = 360 // 毎回 am 6:00 からリセット

            const { mapGrid, bases } = generateMap(rnd)
            this.mapGrid = mapGrid
            this.bases = bases
        },

        createBase(id: string, owner: Owner, rank: Rank, isCore: boolean, x: number, y: number, initialProduction?: number): Base {
            return createBaseLogic(id, owner, rank, isCore, x, y, initialProduction)
        },

        sendUnits(sourceId: string, targetId: string, ratio?: number): void {
            sendUnitsLogic(this, sourceId, targetId, ratio)
        },

        redirectUnit(unitId: string, targetId: string): void {
            redirectUnitLogic(this, unitId, targetId)
        },

        stopUnit(unitId: string): void {
            stopUnitLogic(this, unitId)
        },

        pauseGame(): void {
            if (this.status === 'playing') {
                this.status = 'paused'
            }
        },

        resumeGame(): void {
            if (this.status === 'paused') {
                this.status = 'playing'
            }
        },

        update(deltaSeconds: number): void {
            if (this.status !== 'playing') return

            updateSimulation(this, deltaSeconds)
            updateCPULogic(this, deltaSeconds)
            checkGameOverLogic(this)
        },

        resolveCombat(unit: Unit, target: Base): void {
            resolveCombatLogic(unit, target)
        },

        upgradeBase(baseId: string): boolean {
            return upgradeBaseLogic(this, baseId)
        },

        // A*経路探索のラッパー（GameCanvas.vueからプレビュー用に利用）
        getPath(startWX: number, startWY: number, endWX: number, endWY: number, owner: Owner, rank: Rank): { x: number; y: number }[] {
            return findPath(this.mapGrid, startWX, startWY, endWX, endWY, owner, rank)
        },

        updateCPU(delta: number): void {
            updateCPULogic(this, delta)
        },

        executeCPUAction(): void {
            executeCPUActionLogic(this)
        },

        tryCPUSend(source: Base, target: Base): boolean {
            return tryCPUSendLogic(this, source, target)
        },

        checkGameOver(): void {
            checkGameOverLogic(this)
        },

        startGame(seed?: string): void {
            this.status = 'playing'
            this.initGame(seed)
        },

        backToTitle(): void {
            this.status = 'title'
        }
    }
})
