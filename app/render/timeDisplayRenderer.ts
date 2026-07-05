import * as PIXI from 'pixi.js'

export function createTimeDisplayRenderer(uiLayer: PIXI.Container, skyTilesetTexture: PIXI.Texture, processedReliefTexture: PIXI.Texture) {
    // --- TimeDisplay PIXI Integration ---
    const timeDisplayContainer = new PIXI.Container()
    timeDisplayContainer.sortableChildren = true
    uiLayer.addChild(timeDisplayContainer)

    // Position based on user preference (translated from 10% right, 3rem top)
    timeDisplayContainer.x = 1920 * 0.9 - 192 // Offset by width to align right edge
    timeDisplayContainer.y = 48

    // 楕円のアーチ型マスク（削除要請によりマスク解除）
    const timeDisplayContent = new PIXI.Container()
    timeDisplayContent.sortableChildren = true // zIndexによる順序管理を有効化
    timeDisplayContainer.addChild(timeDisplayContent)

    // 石造りの装飾フレーム (指示に従い均等縮小してフィッティング)
    const timeDisplayFrame = new PIXI.Sprite(processedReliefTexture)

    // 縦横比を維持（均等に縮小）して表示
    timeDisplayFrame.anchor.set(0.5, 0.76)
    timeDisplayFrame.x = 96
    timeDisplayFrame.y = 90 // 下方にオフセット
    timeDisplayFrame.scale.set(0.35, 0.32)

    timeDisplayFrame.zIndex = 10
    timeDisplayContainer.addChild(timeDisplayFrame)

    const skyLayerA = new PIXI.Sprite(skyTilesetTexture)
    const skyLayerB = new PIXI.Sprite(skyTilesetTexture)
    skyLayerA.visible = false
    skyLayerB.visible = false
    timeDisplayContent.addChild(skyLayerA, skyLayerB)

    const sunSprite = new PIXI.Sprite(new PIXI.Texture({
        source: skyTilesetTexture.source,
        frame: new PIXI.Rectangle(0.5, 16.5, 31, 31)
    }))
    const moonSprite = new PIXI.Sprite(new PIXI.Texture({
        source: skyTilesetTexture.source,
        frame: new PIXI.Rectangle(32.5, 16.5, 31, 31)
    }))
    sunSprite.anchor.set(0.5)
    moonSprite.anchor.set(0.5)
    sunSprite.scale.set(1.4)
    moonSprite.scale.set(1.4)
    // 天体（太陽・月）専用のマスク（地平線y=60より上のみ表示）
    const celestialMask = new PIXI.Graphics()
        .rect(0, 0, 192, 60) // 空の表示領域（上半分）
        .fill(0xffffff)

    const celestialContainer = new PIXI.Container()
    celestialContainer.mask = celestialMask
    celestialContainer.addChild(celestialMask)
    celestialContainer.addChild(sunSprite, moonSprite)
    celestialContainer.zIndex = 2 // 空(1)と地上(6)の間

    timeDisplayContent.addChild(celestialContainer)

    const landSprite = new PIXI.Sprite(new PIXI.Texture({
        source: skyTilesetTexture.source,
        frame: new PIXI.Rectangle(1 * 96 + 0.5, 736 + 40 + 0.5, 96 - 1.0, 24 - 1.0)
    }))
    landSprite.width = 192
    landSprite.height = 24
    landSprite.x = 96
    landSprite.y = 60 - 24 + 4 + 7
    landSprite.alpha = 0.9
    landSprite.zIndex = 6 // 最前面
    landSprite.anchor.set(0.5, 0)
    landSprite.scale.set(1.8, 1.2)
    timeDisplayContent.addChild(landSprite)

    function updateSkyLayer(sprite: PIXI.Sprite, hour: number) {
        const elapsed = (hour - 6 + 24) % 24
        const row = elapsed % 6
        const col = Math.floor(elapsed / 6)

        // Original coordinates from Denzi100225-4.png
        const origX = 192 + (col * 96)
        const origY = (row * 80) + 23
        const origW = 96
        const origH = 41

        // Re-use or update texture to avoid excessive object creation?
        // For now, creating a new Texture object is simple but we must ensure it's correct.
        sprite.texture = new PIXI.Texture({
            source: skyTilesetTexture.source,
            frame: new PIXI.Rectangle(origX + 0.5, origY + 0.5, origW - 1.0, origH - 1.0)
        })
        sprite.width = 192
        sprite.height = 60
        sprite.zIndex = 1 // 最背面
        sprite.visible = true
    }

    function updateCelestialPosition(sprite: PIXI.Sprite, type: 'sun' | 'moon', dayTime: number) {
        const dt = dayTime
        const isSun = type === 'sun'
        // 12:00 (720分) で最高点 (Math.sin = 1) になるように角度を計算
        // offset: 太陽は12時に最高点、月は0時に最高点
        const offset = isSun ? 720 : 0
        const angle = ((dt - offset + 1440 + 360) % 1440) / 1440 * Math.PI * 2

        // 楕円のアーチに合わせたX座標の計算 (中心50%, 振幅をさらに中心寄りに調整)
        const x = 50 - Math.cos(angle) * 30

        // 楕円のアーチに合わせたY座標の計算
        // 南中の位置を少し下げるために振幅を減少
        const yAmplitude = isSun ? 35 : 40
        const y = 60 - Math.sin(angle) * yAmplitude

        sprite.x = (x / 100) * 192
        sprite.y = y

        // マスク（celestialMask）により、地平線より下は物理的に隠されるため
        // 手動の visible 制御は廃止し、滑らかな沈み込みを表現する
        sprite.visible = true
    }

    return {
        update(dayTime: number) {
            // Update PIXI-based TimeDisplay
            const dt = dayTime
            const shifted = dt % 1440
            const hour = Math.floor(shifted / 60) % 24
            const minutes = shifted % 60
            const FADE_DURATION = 45

            if (minutes < FADE_DURATION) {
                const progress = minutes / FADE_DURATION
                updateSkyLayer(skyLayerA, hour)
                skyLayerA.zIndex = 1
                skyLayerA.alpha = 1

                updateSkyLayer(skyLayerB, (hour - 1 + 24) % 24)
                skyLayerB.zIndex = 2
                skyLayerB.alpha = 1 - progress
            } else {
                updateSkyLayer(skyLayerA, hour)
                skyLayerA.zIndex = 1
                skyLayerA.alpha = 1
                skyLayerB.visible = false
            }
            timeDisplayContainer.sortChildren()

            updateCelestialPosition(sunSprite, 'sun', dayTime)
            updateCelestialPosition(moonSprite, 'moon', dayTime)
        },
    }
}
