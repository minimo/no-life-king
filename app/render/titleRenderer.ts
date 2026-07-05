import * as PIXI from 'pixi.js'
import type { useGameStore } from '~/stores/game'

const FADE_OUT_DURATION = 1000 // ms

export function createTitleRenderer(titleLayer: PIXI.Container, titleBgTexture: PIXI.Texture, gameStore: ReturnType<typeof useGameStore>) {
    const state = {
        isTransitioning: false,
        titleAlpha: 1,
    }

    // --- Title Screen PIXI Implementation ---
    const titleBg = new PIXI.Sprite(titleBgTexture)
    titleBg.anchor.set(0.5)
    titleBg.x = 1920 / 2
    titleBg.y = 1080 / 2

    // Calculate base scale to cover 1920x1080 (maintain aspect ratio)
    const baseScale = Math.max(1920 / titleBgTexture.width, 1080 / titleBgTexture.height)
    titleBg.scale.set(baseScale)

    titleBg.tint = 0x999999
    titleLayer.addChild(titleBg)

    // Create Radial Vignette using Canvas (more reliable than FillGradient for complex shapes in v8)
    const vignetteCanvas = document.createElement('canvas')
    vignetteCanvas.width = 1024
    vignetteCanvas.height = 1024
    const ctx = vignetteCanvas.getContext('2d')!
    const grad = ctx.createRadialGradient(512, 512, 200, 512, 512, 512)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0.8)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 1024, 1024)

    const vignette = new PIXI.Sprite(PIXI.Texture.from(vignetteCanvas))
    vignette.width = 1920
    vignette.height = 1080
    titleLayer.addChild(vignette)

    const bloodOverlay = new PIXI.Graphics()
        .rect(0, 0, 1920, 1080)
        .fill({ color: 0x8b0000, alpha: 0.15 })
    bloodOverlay.blendMode = 'multiply'
    titleLayer.addChild(bloodOverlay)

    // Title Text Gradient (Gothic Metal to Blood: White -> Silver -> Blood)
    // We use local coordinates (0 to 120 for a 120px font)
    const titleGradient = new PIXI.FillGradient(0, 0, 0, 120)
    titleGradient.addColorStop(0, '#ffffff')    // Bone White (Top)
    titleGradient.addColorStop(0.4, '#a0a0a0')  // Aged Silver (Middle)
    titleGradient.addColorStop(0.7, '#eb3b5a')  // Cursed Crimson (Lower-mid)
    titleGradient.addColorStop(1, '#4b0000')    // Dried Blood (Bottom)

    // Glow Layer (Animated behind title)
    const titleGlowText = new PIXI.Text({
        text: 'NO LIFE KING',
        style: {
            fontFamily: 'Outfit',
            fontSize: 120,
            fill: 0xeb3b5a,
            fontWeight: '900',
            letterSpacing: 20,
        }
    })
    titleGlowText.anchor.set(0.5)
    titleGlowText.x = 1920 / 2
    titleGlowText.y = 1080 / 2 - 150
    titleGlowText.alpha = 0.4
    titleLayer.addChild(titleGlowText)

    const titleText = new PIXI.Text({
        text: 'NO LIFE KING',
        style: {
            fontFamily: 'Outfit',
            fontSize: 120,
            fill: titleGradient,
            fontWeight: '900',
            letterSpacing: 20,
            stroke: { color: '#000000', width: 6, join: 'round' },
            dropShadow: { color: '#8b0000', alpha: 0.4, blur: 20, distance: 0 }
        }
    })
    titleText.anchor.set(0.5, 0.0) // Top-center anchor to make gradient coordinates simpler
    titleText.x = 1920 / 2
    titleText.y = 1080 / 2 - 210 // Adjusted for new anchor
    titleLayer.addChild(titleText)

    const subtitleText = new PIXI.Text({
        text: 'Awaken the Undead. Claim the Realm.',
        style: {
            fontFamily: 'Outfit',
            fontSize: 24,
            fill: 0xc0c0c0,
            fontWeight: '300',
            letterSpacing: 20, // Approx 0.8em
            dropShadow: { color: 0x000000, alpha: 0.5, blur: 4, distance: 2 }
        }
    })
    subtitleText.anchor.set(0.5)
    subtitleText.x = 1920 / 2
    subtitleText.y = 1080 / 2 - 50
    titleLayer.addChild(subtitleText)

    // Start Button
    const startBtn = new PIXI.Container()
    startBtn.x = 1920 / 2
    startBtn.y = 1080 / 2 + 100
    startBtn.eventMode = 'static'
    startBtn.cursor = 'pointer'
    titleLayer.addChild(startBtn)

    // Start Button Gradient (90deg: #4b0000 -> #8b0000 -> #4b0000)
    const btnGradient = new PIXI.FillGradient(-150, 0, 150, 0)
    btnGradient.addColorStop(0, 0x4b0000)
    btnGradient.addColorStop(0.5, 0x8b0000)
    btnGradient.addColorStop(1, 0x4b0000)

    const startBtnBg = new PIXI.Graphics()
        .rect(-150, -30, 300, 60)
        .fill(btnGradient)
        .stroke({ color: 0xeb3b5a, width: 1, alpha: 0.8 })
    startBtn.addChild(startBtnBg)

    const startBtnText = new PIXI.Text({
        text: '覚醒する',
        style: {
            fontFamily: 'Outfit',
            fontSize: 28,
            fill: 0xffffff,
            fontWeight: 'bold',
            letterSpacing: 5
        }
    })
    startBtnText.anchor.set(0.5)
    startBtn.addChild(startBtnText)

    // Start Button Glow Streak (Gradient highlight passing through)
    const streakContainer = new PIXI.Container()
    const streakMask = new PIXI.Graphics()
        .rect(-150, -30, 300, 60)
        .fill(0xffffff)
    streakContainer.mask = streakMask
    startBtn.addChild(streakMask, streakContainer)

    // Linear Gradient for the streak: Transparent -> Soft White -> Transparent
    const streakGradient = new PIXI.FillGradient(-50, 0, 50, 0)
    streakGradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
    streakGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)')
    streakGradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

    const streakHighlight = new PIXI.Graphics()
        .poly([-80, -60, 20, -60, 80, 60, -20, 60]) // Wider slanted shape
        .fill(streakGradient)
    streakHighlight.x = -400
    streakContainer.addChild(streakHighlight)

    let targetBtnScale = 1.0
    let isHoveringStartBtn = false

    startBtn.on('pointerover', () => {
        targetBtnScale = 1.05
        isHoveringStartBtn = true
        streakHighlight.x = -400 // Reset and start streak position
        startBtnBg.tint = 0xffffff
    })
    startBtn.on('pointerout', () => {
        targetBtnScale = 1.0
        isHoveringStartBtn = false
        startBtnBg.tint = 0xcccccc
    })

    async function startTransition(customSeed: string) {
        state.isTransitioning = true
        const startTime = Date.now()

        // ゲームの初期化を先に行っておき、フェード中も描画できるようにする
        gameStore.initGame(customSeed)
        gameStore.status = 'playing'

        const fadeTicker = () => {
            const elapsed = Date.now() - startTime
            const progress = Math.min(1, elapsed / FADE_OUT_DURATION)
            state.titleAlpha = 1 - progress
            titleLayer.alpha = state.titleAlpha

            if (progress < 1) {
                requestAnimationFrame(fadeTicker)
            } else {
                state.isTransitioning = false
                titleLayer.visible = false
            }
        }
        requestAnimationFrame(fadeTicker)
    }

    startBtn.on('pointerdown', () => {
        if (state.isTransitioning) return
        startTransition('')
    })

    // Seed Button
    const seedBtn = new PIXI.Text({
        text: '特定の運命（SEED）で開始',
        style: {
            fontFamily: 'Outfit',
            fontSize: 16,
            fill: 0x999999,
            fontWeight: '600',
            letterSpacing: 2
        }
    })
    seedBtn.anchor.set(0.5)
    seedBtn.x = 1920 / 2
    seedBtn.y = 1080 / 2 + 180
    seedBtn.eventMode = 'static'
    seedBtn.cursor = 'pointer'
    titleLayer.addChild(seedBtn)

    seedBtn.on('pointerover', () => { seedBtn.style.fill = 0xeb3b5a })
    seedBtn.on('pointerout', () => { seedBtn.style.fill = 0x999999 })

    seedBtn.on('pointerdown', () => {
        if (state.isTransitioning) return
        const input = window.prompt('SEEDを入力してください (6桁の数字)', '')
        if (input !== null) {
            startTransition(input)
        }
    })

    // Ember Particles
    const embers: { sprite: PIXI.Graphics, speed: number, angle: number }[] = []
    for (let i = 0; i < 40; i++) {
        const ember = new PIXI.Graphics()
            .circle(0, 0, Math.random() * 2 + 1)
            .fill({ color: 0xeb3b5a, alpha: 0.8 })

        // Slight glow with alpha animation rather than complex filters for perf
        ember.alpha = 0.5 + Math.random() * 0.5
        ember.x = Math.random() * 1920
        ember.y = 1080 + Math.random() * 100
        titleLayer.addChild(ember)
        embers.push({
            sprite: ember,
            speed: Math.random() * 2 + 1,
            angle: (Math.random() - 0.5) * 0.2
        })
    }

    // Info Grid (Bottom icons)
    const infoItems = [
        { icon: '💀', text: '不死の軍勢を率いよ' },
        { icon: '🏰', text: 'かつての領土を奪還せよ' },
        { icon: '🩸', text: '永遠の王として君臨せよ' }
    ]
    const infoContainer = new PIXI.Container()
    infoContainer.y = 1080 - 150
    titleLayer.addChild(infoContainer)

    infoItems.forEach((item, i) => {
        const itemCont = new PIXI.Container()
        itemCont.x = (1920 / 4) * (i + 1)

        const icon = new PIXI.Text({
            text: item.icon,
            style: { fontSize: 40 }
        })
        icon.anchor.set(0.5)

        const txt = new PIXI.Text({
            text: item.text,
            style: {
                fontFamily: 'Outfit',
                fontSize: 18,
                fill: 0x666666,
                fontWeight: '600',
                letterSpacing: 2
            }
        })
        txt.anchor.set(0.5)
        txt.y = 50

        itemCont.addChild(icon, txt)
        infoContainer.addChild(itemCont)
    })

    return {
        state,
        update() {
            // Animate title glow
            const glowScale = 1 + Math.sin(Date.now() * 0.001) * 0.02
            titleGlowText.scale.set(glowScale)
            titleGlowText.alpha = 0.3 + Math.sin(Date.now() * 0.001) * 0.1

            // Animate background (multiply by base scale)
            const animScale = 1 + Math.sin(Date.now() * 0.0002) * 0.03
            titleBg.scale.set(baseScale * animScale)

            // Animate embers
            embers.forEach(e => {
                e.sprite.y -= e.speed
                e.sprite.x += Math.sin(Date.now() * 0.002 + e.sprite.y * 0.01) * 0.5
                if (e.sprite.y < -20) {
                    e.sprite.y = 1080 + 20
                    e.sprite.x = Math.random() * 1920
                }
            })

            // Update Start Button smooth scale
            startBtn.scale.x += (targetBtnScale - startBtn.scale.x) * 0.1
            startBtn.scale.y += (targetBtnScale - startBtn.scale.y) * 0.1

            // Update Start Button Glow Streak (Once per hover)
            if (isHoveringStartBtn && streakHighlight.x < 400) {
                streakHighlight.x += 8 // Slower movement (was 15)
            }
        },
    }
}
