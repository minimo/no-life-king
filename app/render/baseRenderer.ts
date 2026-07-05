import * as PIXI from 'pixi.js'
import { OWNER_COLORS, ZONE_COLORS } from './colors'
import { HIGHLIGHT_HH, HIGHLIGHT_HW, HIGHLIGHT_OFFSET_Y, SCALE_X, SCALE_Y, toIso } from './coords'
import type { Base } from '~/types/game'
import type { BaseTextures } from './textureUtils'

export interface BaseRendererInput {
    onBasePointerDown: (base: Base, e: PIXI.FederatedPointerEvent) => void
    isTarget: (base: Base) => boolean
    isSource: (base: Base) => boolean
}

export function createBaseRenderer(
    mainLayer: PIXI.Container,
    zoneLayer: PIXI.Container,
    textures: BaseTextures,
    input: BaseRendererInput,
) {
    // Mapping from baseId to visuals for efficient updates
    const baseVisuals = new Map<string, { container: PIXI.Container, zone: PIXI.Graphics, highlight: PIXI.Graphics }>()

    return {
        update(bases: Base[], nightTint: number) {
            bases.forEach((base: Base) => {
                let visuals = baseVisuals.get(base.id)
                if (!visuals) {
                    const container = new PIXI.Container()
                    const pos = toIso(base.x, base.y)
                    container.x = pos.x
                    container.y = pos.y
                    container.eventMode = 'static'
                    container.cursor = 'pointer'

                    container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
                        input.onBasePointerDown(base, e)
                    })

                    const zone = new PIXI.Graphics()
                    zone.x = pos.x
                    zone.y = pos.y
                    zoneLayer.addChild(zone)

                    const highlight = new PIXI.Graphics()
                    container.addChild(highlight)

                    // Base Sprite from Tileset
                    const baseSprite = new PIXI.Sprite(textures.baseRank1Texture)
                    baseSprite.label = 'sprite'
                    baseSprite.anchor.set(0.5, 0.8) // Align base of building to point
                    baseSprite.scale.set(1.5)
                    container.addChild(baseSprite)

                    const text = new PIXI.Text({
                        text: '',
                        style: {
                            fontFamily: 'monospace',
                            fontSize: 14, // 13から14に拡大
                            fill: 0xffffff,
                            stroke: { color: 0x000000, width: 2 },
                            fontWeight: 'bold'
                        }
                    })
                    text.anchor.set(0.5)
                    text.label = 'text'
                    container.addChild(text)

                    const flag = new PIXI.Sprite()
                    flag.anchor.set(0.5, 1.0) // ポールの下端を基準にする
                    flag.label = 'flag'
                    container.addChild(flag)

                    mainLayer.addChild(container)
                    visuals = { container, zone, highlight }
                    baseVisuals.set(base.id, visuals)
                }

                const { container, zone, highlight } = visuals
                const pos = toIso(base.x, base.y)
                container.zIndex = pos.y // Important for Y-sorting with units and objects
                const sprite = container.getChildByLabel('sprite') as PIXI.Sprite
                const text = container.getChildByLabel('text') as PIXI.Text
                const flagSprite = container.getChildByLabel('flag') as PIXI.Sprite

                // 所有者とランクに基づいてテクスチャを更新
                if (base.isCore || base.rank >= 3) {
                    sprite.texture = textures.baseRank3Texture
                } else if (base.rank === 2) {
                    sprite.texture = textures.baseRank2Texture
                } else {
                    // 村（Rank 1 かつ本拠地でない場合）
                    if (base.owner === 'player') {
                        sprite.texture = textures.villagePlayerTexture
                    } else if (base.owner === 'neutral') {
                        sprite.texture = textures.villageNeutralTexture
                    } else {
                        sprite.texture = textures.villageCpuTexture
                    }
                }

                // 夜間tintをスプライトに適用（テキストは対象外）
                sprite.filters = null
                sprite.tint = nightTint
                flagSprite.tint = nightTint

                // 城（Rank 3）と砦（Rank 2）が占領されている場合、および本拠地の場合は旗を表示
                const shouldShowFlag = (base.isCore || base.rank >= 2) && base.owner !== 'neutral'

                // 所有者のチームカラーに基づいて色（塗り）と縁取りを更新
                // 数値自体の色は白、縁取りをチームカラーにする（旗の有無に関わらず適用）
                if (base.owner !== 'neutral') {
                    text.style.fill = 0xffffff
                    text.style.stroke = { color: OWNER_COLORS[base.owner], width: 2 }
                } else {
                    text.style.fill = 0xffffff
                    text.style.stroke = { color: 0x000000, width: 2 }
                }

                if (shouldShowFlag) {
                    flagSprite.visible = true
                    flagSprite.texture = base.owner === 'player' ? textures.flagPlayerTexture : textures.flagCpuTexture

                    // 城・本拠地は 22px 上、砦はそれより 4px 下の 18px 上に配置
                    let flagBaseY = -22
                    if (base.rank === 2 && !base.isCore) {
                        flagBaseY = -18
                    }

                    flagSprite.y = flagBaseY

                    // テキストを旗のさらに上に配置（さらに微調整: -23 -> -24）
                    text.y = flagSprite.y - 24
                } else {
                    flagSprite.visible = false
                    // 旗がない場合の通常位置（村など）
                    text.y = -22
                }

                zone.clear()
                if (base.owner !== 'neutral') {
                    const pos = toIso(base.x, base.y)
                    zone.x = pos.x
                    zone.y = pos.y
                    zone.beginPath()
                    zone.fillStyle = ZONE_COLORS[base.owner]
                    // Isometric circle is an ellipse matching the map scale
                    zone.ellipse(0, 0, base.currentZoneRadius * (SCALE_X / 2), base.currentZoneRadius * (SCALE_Y / 2))
                    const alpha = base.owner === 'player' ? 0.4 : 0.15 // Make player's blue more prominent
                    zone.fill({ color: ZONE_COLORS[base.owner], alpha })
                }

                // Target & Source Highlights
                const isTarget = input.isTarget(base)
                const isSource = input.isSource(base)

                highlight.clear()
                if (isTarget || isSource) {
                    // 砦の周囲に緑色の楕円枠を描画
                    highlight.setStrokeStyle({ width: 3, color: 0x2ecc71, alpha: 0.9 })
                    highlight.ellipse(0, HIGHLIGHT_OFFSET_Y, HIGHLIGHT_HW, HIGHLIGHT_HH)
                    highlight.stroke()
                }

                text.text = Math.floor(base.production).toString()
            })
        },
    }
}
