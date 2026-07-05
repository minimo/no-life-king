import * as PIXI from 'pixi.js'
import { getNightAlpha, getNightTint } from '~/game/daynight'

export function createBackgroundRenderer(app: PIXI.Application, layer: PIXI.Container, bgCursedMistTexture: PIXI.Texture) {
    // --- Background "Cursed Mist" Implementation ---
    const bgSprite = new PIXI.Sprite(bgCursedMistTexture)
    bgSprite.width = 1920
    bgSprite.height = 1080
    layer.addChild(bgSprite)

    // 霧の層 (多重スクロール)
    const mistLayers: PIXI.TilingSprite[] = []
    const mistColors = [0x2ecc71, 0x1abc9c, 0x000000] // 緑、青緑、黒の霧
    for (let i = 0; i < 3; i++) {
        // 霧の質感を出すための簡易的なグラフィックテクスチャ生成
        const mistGfx = new PIXI.Graphics()
            .circle(64, 64, 60)
            .fill({ color: mistColors[i % 3], alpha: 0.1 })
        // Blur filter for softness in v8 is Assets based or Filter based,
        // for simplicity, let's just use semi-transparent circles in TilingSprite
        const mistTex = app.renderer.generateTexture(mistGfx)
        const ts = new PIXI.TilingSprite({
            texture: mistTex,
            width: 1920,
            height: 1080
        })
        ts.alpha = 0.2
        ts.blendMode = 'screen'
        layer.addChild(ts)
        mistLayers.push(ts)
    }

    return {
        update(dayTime: number, deltaTime: number) {
            // 背景アニメーションの更新
            // 霧のスクロール
            mistLayers.forEach((mist, i) => {
                const mistSpeed = (0.2 + i * 0.1) * deltaTime
                mist.tilePosition.x += mistSpeed
                mist.tilePosition.y += Math.sin(Date.now() * 0.001 + i) * 0.2

                // 昼夜連動: 夜間(alpha=0.5)に合わせて霧を濃くする
                const nightAlpha = getNightAlpha(dayTime)
                mist.alpha = 0.1 + (nightAlpha * 0.3)
            })

            // 背景画像自体の夜間tint（マップと同様に少し暗くする）
            const bgNightTint = getNightTint(dayTime)
            bgSprite.tint = bgNightTint
        },
    }
}
