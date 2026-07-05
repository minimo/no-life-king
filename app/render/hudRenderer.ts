import * as PIXI from 'pixi.js'
import type { useGameStore } from '~/stores/game'

export function createHudRenderer(app: PIXI.Application, uiLayer: PIXI.Container, gameStore: ReturnType<typeof useGameStore>) {
    // --- SEED Display PIXI ---
    const seedContainer = new PIXI.Container()
    seedContainer.x = 24
    seedContainer.y = 24
    uiLayer.addChild(seedContainer)

    const seedBg = new PIXI.Graphics()
        .roundRect(0, 0, 160, 32, 4)
        .fill({ color: 0x000000, alpha: 0.5 })
        .stroke({ color: 0xa55eea, alpha: 0.3, width: 1 })
    seedContainer.addChild(seedBg)

    const seedText = new PIXI.Text({
        text: `SEED: ${gameStore.seed}`,
        style: {
            fontFamily: 'monospace',
            fontSize: 14,
            fill: 0xa55eea,
            fontWeight: 'bold'
        }
    })
    seedText.x = 12
    seedText.y = 6
    seedContainer.addChild(seedText)

    // --- SendRatio Slider PIXI ---
    const sliderContainer = new PIXI.Container()
    sliderContainer.x = 1920 / 2 - 200 // Center horizontally
    sliderContainer.y = 1080 - 80     // Near bottom
    uiLayer.addChild(sliderContainer)

    const sliderLabel = new PIXI.Text({
        text: `Send Ratio: ${Math.round(gameStore.sendRatio * 100)}%`,
        style: {
            fontFamily: 'Outfit',
            fontSize: 18,
            fill: 0xa55eea,
            fontWeight: 'bold'
        }
    })
    sliderLabel.x = 200 - sliderLabel.width / 2
    sliderLabel.y = -30
    sliderContainer.addChild(sliderLabel)

    const trackWidth = 400
    const sliderTrack = new PIXI.Graphics()
        .roundRect(0, 0, trackWidth, 6, 3)
        .fill(0x333333)
    sliderContainer.addChild(sliderTrack)

    const sliderHandle = new PIXI.Graphics()
        .circle(0, 3, 10)
        .fill(0xa55eea)
        .stroke({ color: 0xffffff, width: 2 })
    sliderHandle.eventMode = 'static'
    sliderHandle.cursor = 'pointer'
    sliderContainer.addChild(sliderHandle)

    let isDraggingSlider = false
    const updateSliderFromPos = (localX: number) => {
        const ratio = Math.max(0.1, Math.min(0.9, localX / trackWidth))
        // Round to 0.1 steps to match previous behavior
        gameStore.sendRatio = Math.round(ratio * 10) / 10
    }

    sliderHandle.on('pointerdown', () => { isDraggingSlider = true })

    // Need to handle global move/up for slider too
    const originalHandlePointerMove = (e: PointerEvent) => {
        if (!isDraggingSlider || !app.canvas) return
        const rect = app.canvas.getBoundingClientRect()
        const scaleX = 1920 / rect.width
        const localX = (e.clientX - rect.left) * scaleX - sliderContainer.x
        updateSliderFromPos(localX)
    }

    const handleSliderPointerUp = () => { isDraggingSlider = false }

    window.addEventListener('pointermove', originalHandlePointerMove)
    window.addEventListener('pointerup', handleSliderPointerUp)

    return {
        update() {
            // Update SEED (in case it changes, though usually static)
            seedText.text = `SEED: ${gameStore.seed}`

            // Update Slider
            sliderLabel.text = `Send Ratio: ${Math.round(gameStore.sendRatio * 100)}%`
            sliderLabel.x = 200 - sliderLabel.width / 2
            sliderHandle.x = gameStore.sendRatio * trackWidth
        },
        destroy() {
            window.removeEventListener('pointermove', originalHandlePointerMove)
            window.removeEventListener('pointerup', handleSliderPointerUp)
        },
    }
}
