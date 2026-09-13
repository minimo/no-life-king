import { computed, nextTick, ref } from 'vue'
import type * as PIXI from 'pixi.js'
import { RANK_CONFIG } from '~/game/constants'
import { fromIso, toIso } from '~/render/coords'
import type { Base, Unit } from '~/types/game'
import type { useGameStore } from '~/stores/game'

type EntityPointerEvent = Pick<PointerEvent, 'clientX' | 'clientY' | 'stopPropagation'>

const DOUBLE_CLICK_THRESHOLD = 300 // ms
const LONG_PRESS_THRESHOLD = 500 // ms

export function useGameInput(gameStore: ReturnType<typeof useGameStore>) {
    const contextMenuRef = ref<HTMLElement | null>(null)
    const mousePos = ref({ x: 0, y: 0 })
    const worldMousePos = ref({ x: 0, y: 0 })
    let projectPoint = toIso
    const pointerDownPos = ref({ x: 0, y: 0 })
    const pointerDownEntityId = ref<string | null>(null)
    const draggingFromBaseId = ref<string | null>(null)
    const targetedBaseId = ref<string | null>(null)
    const multiSendTargetId = ref<string | null>(null)
    const selectedUnitId = ref<string | null>(null)
    const menuJustOpened = ref(false)

    // Context Menu State
    const contextMenu = ref<{
        visible: boolean;
        x: number;
        y: number;
        type: 'base' | 'unit' | null;
        targetId: string | null;
    }>({
        visible: false,
        x: 0,
        y: 0,
        type: null,
        targetId: null
    })

    const upgradeCost = computed(() => {
        if (contextMenu.value.type !== 'base' || !contextMenu.value.targetId) return 0
        const base = gameStore.bases.find((b: Base) => b.id === contextMenu.value.targetId)
        if (!base || base.rank >= 3) return 0
        return RANK_CONFIG[base.rank].upgradeCost
    })

    const canUpgradeTargetBase = computed(() => {
        if (contextMenu.value.type !== 'base' || !contextMenu.value.targetId) return false
        const base = gameStore.bases.find((b: Base) => b.id === contextMenu.value.targetId)
        if (!base || base.rank >= 3) return false
        return base.production >= upgradeCost.value
    })

    let lastClickTime = 0
    let lastClickedBaseId = ''
    let longPressTimeout: ReturnType<typeof setTimeout> | null = null
    let createFloatingText: ((text: string, x: number, y: number, color?: number) => void) | null = null

    const setCreateFloatingText = (fn: (text: string, x: number, y: number, color?: number) => void) => {
        createFloatingText = fn
    }

    const clearLongPress = () => {
        if (longPressTimeout) {
            clearTimeout(longPressTimeout)
            longPressTimeout = null
        }
    }

    const openContextMenu = async (type: 'base' | 'unit', targetId: string, clickX: number, clickY: number) => {
        contextMenu.value = {
            visible: true,
            x: clickX,
            y: clickY,
            type,
            targetId
        }

        await nextTick()
        if (contextMenuRef.value) {
            const rect = contextMenuRef.value.getBoundingClientRect()
            const viewportWidth = window.innerWidth
            const viewportHeight = window.innerHeight

            let newX = clickX
            let newY = clickY

            if (newX + rect.width > viewportWidth - 10) {
                newX = viewportWidth - rect.width - 10
            }
            if (newY + rect.height > viewportHeight - 10) {
                newY = viewportHeight - rect.height - 10
            }

            contextMenu.value.x = newX
            contextMenu.value.y = newY
        }

        gameStore.pauseGame()
        draggingFromBaseId.value = null
        pointerDownEntityId.value = null
        menuJustOpened.value = true
    }

    const handleBasePointerDown = (base: Base, e: EntityPointerEvent) => {
        clearLongPress()

        pointerDownPos.value = { x: e.clientX, y: e.clientY }

        const now = Date.now()
        const isDoubleClick = (now - lastClickTime < DOUBLE_CLICK_THRESHOLD) && (lastClickedBaseId === base.id)

        if (isDoubleClick) {
            multiSendTargetId.value = base.id
            draggingFromBaseId.value = null
            pointerDownEntityId.value = null // Cancel context menu for this double click
        } else if (base.owner === 'player') {
            pointerDownEntityId.value = base.id // ALLOW MENU ONLY FOR PLAYER BASES
            draggingFromBaseId.value = base.id
            multiSendTargetId.value = null

            // start long press timeout
            const clickX = e.clientX
            const clickY = e.clientY
            longPressTimeout = setTimeout(() => {
                longPressTimeout = null
                openContextMenu('base', base.id, clickX, clickY)
            }, LONG_PRESS_THRESHOLD)
        } else {
            pointerDownEntityId.value = null
        }
        selectedUnitId.value = null

        lastClickTime = now
        lastClickedBaseId = base.id
    }

    const handleUnitPointerDown = (unit: Unit, e: EntityPointerEvent) => {
        e.stopPropagation()
        pointerDownPos.value = { x: e.clientX, y: e.clientY }
        selectedUnitId.value = selectedUnitId.value === unit.id ? null : unit.id

        clearLongPress()

        if (unit.owner === 'player') {
            pointerDownEntityId.value = `unit:${unit.id}`
            draggingFromBaseId.value = `unit:${unit.id}`
            const clickX = e.clientX
            const clickY = e.clientY
            longPressTimeout = setTimeout(() => {
                longPressTimeout = null
                openContextMenu('unit', unit.id, clickX, clickY)
            }, LONG_PRESS_THRESHOLD)
        } else {
            pointerDownEntityId.value = null
        }
    }

    const updateTargetedBase = () => {
        // The renderer supplies logical map coordinates, independent of the camera.
        const logicalMouse = worldMousePos.value

        if (draggingFromBaseId.value) {
            let closestBaseId: string | null = null
            let minDist = Infinity
            gameStore.bases.forEach((base: Base) => {
                const dist = Math.sqrt(Math.pow(base.x - logicalMouse.x, 2) + Math.pow(base.y - logicalMouse.y, 2))
                if (dist < minDist) {
                    minDist = dist
                    closestBaseId = base.id
                }
            })
            if (minDist <= gameStore.targetSelectThreshold) {
                targetedBaseId.value = closestBaseId
            } else {
                targetedBaseId.value = null
            }
        } else {
            targetedBaseId.value = null
        }
    }

    const setWorldPointer = (point: { x: number; y: number }) => {
        worldMousePos.value = point
        mousePos.value = toIso(point.x, point.y)
        if (multiSendTargetId.value) {
            const target = gameStore.bases.find(b => b.id === multiSendTargetId.value)
            if (target && Math.hypot(target.x - point.x, target.y - point.y) > 30) multiSendTargetId.value = null
        }
        updateTargetedBase()
    }

    const reset = () => {
        clearLongPress()
        draggingFromBaseId.value = null
        targetedBaseId.value = null
        multiSendTargetId.value = null
        selectedUnitId.value = null
        pointerDownEntityId.value = null
        contextMenu.value = { visible: false, x: 0, y: 0, type: null, targetId: null }
        menuJustOpened.value = false
        lastClickTime = 0
        lastClickedBaseId = ''
    }

    const handleStagePointerMove = (app: PIXI.Application, e: PIXI.FederatedPointerEvent) => {
        const localPos = e.getLocalPosition(app.stage)
        mousePos.value = { x: localPos.x, y: localPos.y }
        const logicalMouse = fromIso(localPos.x, localPos.y)
        worldMousePos.value = logicalMouse

        if (multiSendTargetId.value) {
            const targetBase = gameStore.bases.find(b => b.id === multiSendTargetId.value)
            if (targetBase) {
                const dist = Math.sqrt(Math.pow(targetBase.x - logicalMouse.x, 2) + Math.pow(targetBase.y - logicalMouse.y, 2))
                if (dist > 30) {
                    multiSendTargetId.value = null
                }
            }
        }
    }

    const handleStagePointerDown = () => {
        // 背景クリックでユニット選択解除
        selectedUnitId.value = null
    }

    const handleGlobalPointerMove = (e: PointerEvent) => {
        if (longPressTimeout) {
            const distMoved = Math.hypot(e.clientX - pointerDownPos.value.x, e.clientY - pointerDownPos.value.y)
            if (distMoved > 10) {
                clearLongPress()
            }
        }
    }

    const closeContextMenu = () => {
        contextMenu.value.visible = false
        contextMenu.value.targetId = null
        contextMenu.value.type = null
        gameStore.resumeGame()
    }

    const handleGlobalPointerUp = async (e: PointerEvent) => {
        clearLongPress()

        const logicalMouse = worldMousePos.value
        const distMoved = Math.hypot(e.clientX - pointerDownPos.value.x, e.clientY - pointerDownPos.value.y)
        const isClick = distMoved < 10

        if (isClick && pointerDownEntityId.value) {
            // Normal single short click on a base/unit.
            // Menus now trigger on long-press instead, so short-clicks do nothing but end dragging.
            draggingFromBaseId.value = null
            pointerDownEntityId.value = null
            return // Stop further drag processing
        }

        // Clear tracker
        pointerDownEntityId.value = null

        if (menuJustOpened.value) {
            menuJustOpened.value = false
            return
        }

        // Close context menu if clicking anywhere else
        if (contextMenu.value.visible) {
            // Check if click was inside the context menu
            const isInsideMenu = contextMenuRef.value?.contains(e.target as Node)
            if (!isInsideMenu) {
                closeContextMenu()
            }
        }

        if (multiSendTargetId.value) {
            const targetId = multiSendTargetId.value
            gameStore.bases.forEach(base => {
                if (base.owner === 'player' && base.id !== targetId) {
                    gameStore.sendUnits(base.id, targetId)
                }
            })
            multiSendTargetId.value = null
        } else if (draggingFromBaseId.value) {
            let closestBase: Base | null = null
            let minDist = Infinity

            for (const base of gameStore.bases) {
                const dist = Math.sqrt(Math.pow(base.x - logicalMouse.x, 2) + Math.pow(base.y - logicalMouse.y, 2))
                if (dist < minDist) {
                    minDist = dist
                    closestBase = base
                }
            }

            if (closestBase && minDist <= gameStore.targetSelectThreshold) {
                if (draggingFromBaseId.value.startsWith('unit:')) {
                    const unitId = draggingFromBaseId.value.split(':')[1]!
                    gameStore.redirectUnit(unitId, closestBase.id)
                } else {
                    gameStore.sendUnits(draggingFromBaseId.value, closestBase.id)
                }
            }

            draggingFromBaseId.value = null
        }
    }

    const handleContextMenuAction = (action: string) => {
        if (action === 'upgrade' && contextMenu.value.type === 'base' && contextMenu.value.targetId) {
            const success = gameStore.upgradeBase(contextMenu.value.targetId)
            if (success) {
                const base = gameStore.bases.find(b => b.id === contextMenu.value.targetId)
                if (base && createFloatingText) {
                    const pos = projectPoint(base.x, base.y)
                    createFloatingText('RANK UP!', pos.x, pos.y - 60, 0x2ecc71)
                }
            }
        } else if (action === 'stop' && contextMenu.value.type === 'unit' && contextMenu.value.targetId) {
            gameStore.stopUnit(contextMenu.value.targetId)
        }
        closeContextMenu()
    }

    return {
        setWorldPointer,
        worldMousePos,
        reset,
        setProjectPoint: (fn: typeof toIso) => { projectPoint = fn },
        contextMenuRef,
        mousePos,
        pointerDownPos,
        pointerDownEntityId,
        draggingFromBaseId,
        targetedBaseId,
        multiSendTargetId,
        selectedUnitId,
        contextMenu,
        upgradeCost,
        canUpgradeTargetBase,
        setCreateFloatingText,
        handleBasePointerDown,
        handleUnitPointerDown,
        handleStagePointerMove,
        handleStagePointerDown,
        handleGlobalPointerMove,
        handleGlobalPointerUp,
        handleContextMenuAction,
        closeContextMenu,
        updateTargetedBase,
        clearSelection: () => {
            selectedUnitId.value = null
        },
        isTargetBase: (base: Base) => base.id === targetedBaseId.value || base.id === multiSendTargetId.value,
        isSourceBase: (base: Base) => base.id === draggingFromBaseId.value
            || (multiSendTargetId.value !== null && base.owner === 'player' && base.id !== multiSendTargetId.value),
    }
}

export type GameInput = ReturnType<typeof useGameInput>
