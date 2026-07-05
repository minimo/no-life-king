import * as PIXI from 'pixi.js'
import { OWNER_COLORS } from './colors'
import { toIso } from './coords'
import type { Base, Unit } from '~/types/game'
import type { UnitAnimationsByRank } from './textureUtils'

export interface UnitRendererInput {
    onUnitPointerDown: (unit: Unit, e: PIXI.FederatedPointerEvent) => void
}

export function createUnitRenderer(
    mainLayer: PIXI.Container,
    playerAnimsByRank: UnitAnimationsByRank,
    cpuAnimsByRank: UnitAnimationsByRank,
    input: UnitRendererInput,
) {
    // Mapping from unitId to visuals for efficient updates
    const unitVisuals = new Map<string, { container: PIXI.Container, sprite: PIXI.AnimatedSprite, text: PIXI.Text }>()

    return {
        hasVisual(unitId: string) {
            return unitVisuals.has(unitId)
        },

        update(units: Unit[], bases: Base[], status: string, nightTint: number) {
            // Cleanup old visuals
            const currentUnitIds = new Set(units.map(u => u.id))
            for (const [id, visuals] of unitVisuals.entries()) {
                if (!currentUnitIds.has(id)) {
                    visuals.container.destroy({ children: true })
                    unitVisuals.delete(id)
                }
            }

            units.forEach((unit: Unit) => {
                let visuals = unitVisuals.get(unit.id)

                if (!visuals) {
                    const container = new PIXI.Container()
                    const isPlayer = unit.owner === 'player'
                    const animsByRank = isPlayer ? playerAnimsByRank : cpuAnimsByRank
                    const anims = animsByRank[unit.rank]

                    const sprite = new PIXI.AnimatedSprite(anims.walkDown)
                    sprite.anchor.set(0.5, 0.8)
                    sprite.animationSpeed = 0.1
                    sprite.play()
                    sprite.scale.set(1.0)

                    container.addChild(sprite)

                    // ユニットクリックで選択
                    container.eventMode = 'static'
                    container.cursor = 'pointer'
                    container.hitArea = new PIXI.Circle(0, -20, 20)
                    container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
                        input.onUnitPointerDown(unit, e)
                    })

                    const strokeColor = unit.owner === 'player' ? OWNER_COLORS.player : OWNER_COLORS.cpu
                    const text = new PIXI.Text({
                        text: Math.ceil(unit.power).toString(),
                        style: {
                            fontSize: 14,
                            fill: 0xffffff, // 白塗り
                            stroke: { color: strokeColor, width: 2 }, // チームカラー縁取り
                            fontFamily: 'monospace',
                            fontWeight: 'bold'
                        }
                    })
                    text.anchor.set(0.5)
                    text.y = -38 // フォント拡大に合わせて位置を調整 (-35 -> -38)
                    container.addChild(text)

                    mainLayer.addChild(container)
                    visuals = { container, sprite, text }
                    unitVisuals.set(unit.id, visuals)
                }

                const { container, sprite, text } = visuals
                const pos = toIso(unit.x, unit.y)
                container.x = pos.x
                container.y = pos.y
                container.zIndex = pos.y // Continuous Y-sorting
                text.text = Math.ceil(unit.power).toString()

                // 所有者のチームカラーに基づいて縁取りを更新
                const strokeColor = unit.owner === 'player' ? OWNER_COLORS.player : OWNER_COLORS.cpu
                text.style.fill = 0xffffff
                text.style.stroke = { color: strokeColor, width: 2 }
                text.style.fontSize = 14

                if (sprite instanceof PIXI.AnimatedSprite) {
                    // Determine Animation & Direction
                    const source = bases.find(b => b.id === unit.sourceId)
                    const target = bases.find(b => b.id === unit.targetId)

                    let isMovingRight = false
                    let isMovingUp = false

                    if (target && source) {
                        // Use screen-space (isometric) coordinates to determine visual direction
                        const sPos = toIso(source.x, source.y)
                        const tPos = toIso(target.x, target.y)
                        isMovingRight = tPos.x > sPos.x
                        isMovingUp = tPos.y < sPos.y
                    }

                    // Flip sprite for right movement (original is left-facing: scale.x = 1.5)
                    sprite.scale.x = isMovingRight ? -1.0 : 1.0
                    sprite.tint = nightTint // 夜間tintをユニットスプライトに適用

                    const isPlayer = unit.owner === 'player'
                    const animsByRank = isPlayer ? playerAnimsByRank : cpuAnimsByRank
                    const anims = animsByRank[unit.rank]

                    let targetAnim: any
                    if (unit.isFighting) {
                        // Row 2 (attackDown key mapping to Row 2 frames) for Up, Row 1 (attackUp key) for Down/Parallel
                        targetAnim = isMovingUp ? anims.attackDown : anims.attackUp
                    } else {
                        // Row 2 (walkDown key) for Up, Row 1 (walkUp key) for Down/Parallel
                        targetAnim = isMovingUp ? anims.walkDown : anims.walkUp
                    }

                    if (sprite.textures !== targetAnim) {
                        sprite.textures = targetAnim
                    }

                    if (status === 'playing') {
                        if (!sprite.playing) sprite.play()
                    } else {
                        if (sprite.playing) sprite.stop()
                    }
                }
            })
        },
    }
}
