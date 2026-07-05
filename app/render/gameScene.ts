import * as PIXI from 'pixi.js'
import { getNightTint } from '~/game/daynight'
import type { useGameStore } from '~/stores/game'
import type { GameInput } from '~/composables/useGameInput'
import { loadGameAssets } from './assets'
import { createBackgroundRenderer } from './backgroundRenderer'
import { OWNER_COLORS } from './colors'
import { createFloatingTextFactory } from './effects'
import { createLayers, setGameplayVisibility } from './layers'
import { renderStaticMap } from './mapRenderer'
import { createBaseRenderer } from './baseRenderer'
import { createUnitRenderer } from './unitRenderer'
import { renderDragArrows, renderSelectedUnitPath } from './arrowRenderer'
import { createHudRenderer } from './hudRenderer'
import { createTimeDisplayRenderer } from './timeDisplayRenderer'
import { createTitleRenderer } from './titleRenderer'
import { createBaseTextures, createTileTextures, createTransparentTexture, createUnitAnimations } from './textureUtils'

interface GameSceneOptions {
    canvasEl: HTMLElement
    gameStore: ReturnType<typeof useGameStore>
    input: GameInput
}

export async function createGameScene({ canvasEl, gameStore, input }: GameSceneOptions) {
    console.log('Initializing Game Store...')
    gameStore.initGame()

    console.log('Initializing Pixi Application...')
    let app: PIXI.Application
    try {
        app = new PIXI.Application()
        await app.init({
            width: 1920,
            height: 1080,
            backgroundColor: 0x1a1a1a,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
            roundPixels: true, // 描画のノイズ（テクスチャブリード）を抑制
        })
        console.log('Pixi initialized successfully')
    } catch (error) {
        console.error('Failed to initialize Pixi:', error)
        throw error
    }

    if (app.canvas) {
        app.canvas.style.width = '100%'
        app.canvas.style.height = '100%'
        canvasEl.appendChild(app.canvas)
    }

    const assets = await loadGameAssets()
    // レリーフの透過処理を実行
    const processedReliefTexture = createTransparentTexture(assets.reliefTexture)

    const tileTextures = createTileTextures(assets.mapTilesetTexture)
    const baseTextures = createBaseTextures(assets.mapTilesetTexture, {
        player: OWNER_COLORS.player,
        cpu: OWNER_COLORS.cpu,
    })
    const { playerAnimsByRank, cpuAnimsByRank } = createUnitAnimations(
        assets.playerBaseTexture,
        assets.playerRedBaseTexture,
        assets.playerGoldBaseTexture,
        assets.cpuBaseTexture,
        assets.cpuRedBaseTexture,
        assets.cpuGoldBaseTexture,
    )

    const layers = createLayers(app.stage)

    const effectLayer = new PIXI.Container() // For floating texts
    layers.uiLayer.addChild(effectLayer)
    input.setCreateFloatingText(createFloatingTextFactory(app, effectLayer))

    const backgroundRenderer = createBackgroundRenderer(app, layers.backgroundLayer, assets.bgCursedMistTexture)
    const titleRenderer = createTitleRenderer(layers.titleLayer, assets.titleBgTexture, gameStore)

    renderStaticMap(gameStore.mapGrid, layers.mapLayer, layers.mainLayer, tileTextures)

    const dragLine = new PIXI.Graphics()
    layers.highlightLayer.addChild(dragLine)

    const unitPathGfx = new PIXI.Graphics()
    layers.highlightLayer.addChild(unitPathGfx)

    const timeDisplayRenderer = createTimeDisplayRenderer(layers.uiLayer, assets.skyTilesetTexture, processedReliefTexture)
    const hudRenderer = createHudRenderer(app, layers.uiLayer, gameStore)
    const baseRenderer = createBaseRenderer(layers.mainLayer, layers.zoneLayer, baseTextures, {
        onBasePointerDown: input.handleBasePointerDown,
        isTarget: input.isTargetBase,
        isSource: input.isSourceBase,
    })
    const unitRenderer = createUnitRenderer(layers.mainLayer, playerAnimsByRank, cpuAnimsByRank, {
        onUnitPointerDown: input.handleUnitPointerDown,
    })

    const getPlayerPath = (sx: number, sy: number, tx: number, ty: number, rank: 1 | 2 | 3) => {
        return gameStore.getPath(sx, sy, tx, ty, rank)
    }

    const ticker = (ticker: PIXI.Ticker) => {
        const deltaSeconds = ticker.deltaTime / 60

        if (gameStore.status === 'title') {
            layers.titleLayer.visible = true
            setGameplayVisibility(layers, false)
            titleRenderer.update()
            return // Don't run game logic if in title
        }

        if (titleRenderer.state.isTransitioning || gameStore.status === 'playing') {
            layers.titleLayer.visible = titleRenderer.state.titleAlpha > 0
            setGameplayVisibility(layers, true)
        } else {
            layers.titleLayer.visible = false
        }

        backgroundRenderer.update(gameStore.dayTime, ticker.deltaTime)

        gameStore.update(deltaSeconds)

        // 夜間tintの計算（マップオブジェクトのみに適用、UIテキストは対象外）
        const nightTint = getNightTint(gameStore.dayTime)
        layers.mapLayer.tint = nightTint
        layers.zoneLayer.tint = nightTint

        timeDisplayRenderer.update(gameStore.dayTime)
        hudRenderer.update()

        input.updateTargetedBase()
        baseRenderer.update(gameStore.bases, nightTint)
        unitRenderer.update(gameStore.units, gameStore.bases, gameStore.status, nightTint)

        renderDragArrows(dragLine, gameStore.bases, gameStore.units, {
            multiSendTargetId: input.multiSendTargetId.value,
            draggingFromBaseId: input.draggingFromBaseId.value,
            targetedBaseId: input.targetedBaseId.value,
            mousePos: input.mousePos.value,
        }, getPlayerPath)

        renderSelectedUnitPath(
            unitPathGfx,
            input.selectedUnitId.value,
            gameStore.units,
            gameStore.bases,
            unitRenderer.hasVisual,
            input.clearSelection,
        )
    }

    app.ticker.add(ticker)

    // Global mouse move and up
    app.stage.eventMode = 'static'
    app.stage.hitArea = app.screen
    app.stage.sortableChildren = true // Enable sorting for unit zIndex

    const handleStagePointerMove = (e: PIXI.FederatedPointerEvent) => input.handleStagePointerMove(app, e)
    app.stage.on('pointermove', handleStagePointerMove)
    app.stage.on('pointerdown', input.handleStagePointerDown)

    window.addEventListener('pointerup', input.handleGlobalPointerUp)
    window.addEventListener('pointermove', input.handleGlobalPointerMove)

    return {
        app,
        destroy() {
            window.removeEventListener('pointerup', input.handleGlobalPointerUp)
            window.removeEventListener('pointermove', input.handleGlobalPointerMove)
            hudRenderer.destroy()
            app.stage.off('pointermove', handleStagePointerMove)
            app.stage.off('pointerdown', input.handleStagePointerDown)
            app.ticker.remove(ticker)
            app.destroy(true, { children: true, texture: true })
        },
    }
}

export type GameScene = Awaited<ReturnType<typeof createGameScene>>
