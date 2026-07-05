import * as PIXI from 'pixi.js'
import type { Base, Rank } from '~/types/game'

export interface TileTextures {
    grassTexture: PIXI.Texture
    waterTexture: PIXI.Texture
    mountainTextures: PIXI.Texture[]
    woodTextures: PIXI.Texture[]
    bridgeYTexture: PIXI.Texture
    bridgeXTexture: PIXI.Texture
}

export interface BaseTextures {
    baseRank3Texture: PIXI.Texture
    baseRank2Texture: PIXI.Texture
    baseRank1Texture: PIXI.Texture
    villageNeutralTexture: PIXI.Texture
    villagePlayerTexture: PIXI.Texture
    villageCpuTexture: PIXI.Texture
    flagPlayerTexture: PIXI.Texture
    flagCpuTexture: PIXI.Texture
}

export interface UnitAnimations {
    idle: PIXI.Texture[]
    walkUp: PIXI.Texture[]
    walkDown: PIXI.Texture[]
    attackUp: PIXI.Texture[]
    attackDown: PIXI.Texture[]
}

export type UnitAnimationsByRank = Record<Rank, UnitAnimations>

export function createFrames(texture: PIXI.Texture, yOffset: number, count = 4) {
    const frames = []
    for (let i = 0; i < count; i++) {
        // 素材に含まれるグリッド線（ガイド）の映り込みを避けるため、境界から1px内側を切り出す
        // 64x64の領域に対して 62x62 でサンプリングする
        frames.push(new PIXI.Texture({
            source: texture.source,
            frame: new PIXI.Rectangle(i * 64 + 1, yOffset + 1, 62, 62)
        }))
    }
    return frames
}

export function createTileTextures(mapTilesetTexture: PIXI.Texture): TileTextures {
    // Map Tile Textures
    // Grass tile: base grid is 32x16, let's use 0,0 but precise offset 16,16
    const grassTexture = new PIXI.Texture({
        source: mapTilesetTexture.source,
        frame: new PIXI.Rectangle(16 + 0 * 32, 16 + 0 * 16, 32, 16)
    })
    // Water tile: verified at X:0, Y:4
    const waterTexture = new PIXI.Texture({
        source: mapTilesetTexture.source,
        frame: new PIXI.Rectangle(16 + 0 * 32, 16 + 4 * 16, 32, 16)
    })
    // Mountain tile: 4 variations (0-1 are low, 2-3 are high). verified at X:0..3, Y:15 (tall, starts at Y:14)
    const mountainTextures = Array.from({ length: 4 }, (_, i) => new PIXI.Texture({
        source: mapTilesetTexture.source,
        frame: new PIXI.Rectangle(16 + i * 32, 16 + 14 * 16, 32, 32)
    }))
    // Wood tile: 11 variations. verified at X:0..10, Y:17 (tall, starts at Y:16)
    const woodTextures = Array.from({ length: 11 }, (_, i) => new PIXI.Texture({
        source: mapTilesetTexture.source,
        frame: new PIXI.Rectangle(16 + i * 32, 16 + 16 * 16, 32, 32)
    }))
    // Bridge textures (32x32 at y=320 row, 4th and 5th slots)
    // Bridge Y (Slot 4, x=112): Bottom-Left to Top-Right
    const bridgeYTexture = new PIXI.Texture({
        source: mapTilesetTexture.source,
        frame: new PIXI.Rectangle(112, 320, 32, 32)
    })
    // Bridge X (Slot 5, x=144): Top-Left to Bottom-Right
    const bridgeXTexture = new PIXI.Texture({
        source: mapTilesetTexture.source,
        frame: new PIXI.Rectangle(144, 320, 32, 32)
    })

    return { grassTexture, waterTexture, mountainTextures, woodTextures, bridgeYTexture, bridgeXTexture }
}

export function createBaseTextures(mapTilesetTexture: PIXI.Texture, ownerColors: { player: number; cpu: number }): BaseTextures {
    // Buildings: 32x32 sprites at y=320 row (grid row 19-20)
    // Building A (城): col 0 → (16, 320)
    const baseRank3Texture = new PIXI.Texture({
        source: mapTilesetTexture.source,
        frame: new PIXI.Rectangle(16, 320, 32, 32)
    })
    // Building B (砦): col 1 → (48, 320)
    const baseRank2Texture = new PIXI.Texture({
        source: mapTilesetTexture.source,
        frame: new PIXI.Rectangle(48, 320, 32, 32)
    })
    // Building C (集落): col 2 → (80, 320)
    const baseRank1Texture = new PIXI.Texture({
        source: mapTilesetTexture.source,
        frame: new PIXI.Rectangle(80, 320, 32, 32)
    })

    // 各所有者ごとの村テクスチャを事前生成
    const villageNeutralTexture = createVillageTexture(baseRank1Texture, [0.7, 0.7, 0.7]) // 灰色
    const villagePlayerTexture = createVillageTexture(baseRank1Texture, [0.2, 0.6, 1.0])  // 青色
    const villageCpuTexture = baseRank1Texture // デフォルト（赤色）

    // 各勢力ごとの旗テクスチャを事前生成
    const flagPlayerTexture = createFlagTexture(ownerColors.player)
    const flagCpuTexture = createFlagTexture(ownerColors.cpu)

    return {
        baseRank3Texture,
        baseRank2Texture,
        baseRank1Texture,
        villageNeutralTexture,
        villagePlayerTexture,
        villageCpuTexture,
        flagPlayerTexture,
        flagCpuTexture,
    }
}

export function getBaseTexture(base: Base, textures: BaseTextures) {
    if (base.isCore || base.rank >= 3) return textures.baseRank3Texture
    if (base.rank === 2) return textures.baseRank2Texture
    return textures.baseRank1Texture
}

// ドット絵風の旗テクスチャを作成する関数
export function createFlagTexture(teamColor: number) {
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 32
    const ctx = canvas.getContext('2d')!

    // チームカラーの分解
    const r = (teamColor >> 16) & 0xFF
    const g = (teamColor >> 8) & 0xFF
    const b = teamColor & 0xFF

    // ポール部分（ドット絵風 12px）
    ctx.fillStyle = '#333333'
    ctx.fillRect(7, 20, 2, 12) // メインの柱
    ctx.fillStyle = '#666666'
    ctx.fillRect(7, 20, 1, 12) // ハイライト

    // 旗の布部分（ドット絵風の三角形、サイズ維持）
    // アウトライン
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.moveTo(8, 20)
    ctx.lineTo(16, 24)
    ctx.lineTo(8, 28)
    ctx.fill()

    // メインカラー
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.beginPath()
    ctx.moveTo(9, 21)
    ctx.lineTo(14, 24)
    ctx.lineTo(9, 27)
    ctx.fill()

    // 陰影（下部）
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.beginPath()
    ctx.moveTo(9, 25)
    ctx.lineTo(14, 24)
    ctx.lineTo(9, 27)
    ctx.fill()

    return PIXI.Texture.from(canvas)
}

// 村の屋根の色を置換したテクスチャを作成する関数
export function createVillageTexture(sourceTexture: PIXI.Texture, targetRGB: [number, number, number]) {
    // 一時的なCanvasを使用してピクセルデータを抽出
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    const ctx = canvas.getContext('2d')!

    // 元のテクスチャをCanvasに描画
    const baseSource = sourceTexture.source.resource as HTMLImageElement
    const frame = sourceTexture.frame
    ctx.drawImage(baseSource, frame.x, frame.y, frame.width, frame.height, 0, 0, 32, 32)

    const imageData = ctx.getImageData(0, 0, 32, 32)
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i]! / 255
        const g = data[i + 1]! / 255
        const b = data[i + 2]! / 255

        // 屋根の赤色部分を詳細に判定
        if (r > g * 1.4 && r > b * 1.4 && r > 0.3) {
            data[i] = targetRGB[0] * r * 255
            data[i + 1] = targetRGB[1] * r * 255
            data[i + 2] = targetRGB[2] * r * 255
        }
    }
    ctx.putImageData(imageData, 0, 0)
    return PIXI.Texture.from(canvas)
}

// 黒背景を除去して透過テクスチャを生成する関数
export function createTransparentTexture(sourceTexture: PIXI.Texture, tolerance = 40) {
    const source = sourceTexture.source
    if (!source.resource) return sourceTexture

    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext('2d')!

    // HTMLImageElement として描画
    ctx.drawImage(source.resource as any, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
        // 純粋な黒 (0,0,0) 付近だけでなく、暗い色も完全に透明にする
        const r = data[i]!
        const g = data[i + 1]!
        const b = data[i + 2]!
        if (r < tolerance && g < tolerance && b < tolerance) {
            data[i + 3] = 0 // 透明化
        }
    }
    ctx.putImageData(imageData, 0, 0)
    return PIXI.Texture.from(canvas)
}

export function createUnitAnimations(
    playerBaseTexture: PIXI.Texture,
    playerRedBaseTexture: PIXI.Texture,
    playerGoldBaseTexture: PIXI.Texture,
    cpuBaseTexture: PIXI.Texture,
    cpuRedBaseTexture: PIXI.Texture,
    cpuGoldBaseTexture: PIXI.Texture,
) {
    const playerAnimsByRank: UnitAnimationsByRank = {
        1: {
            idle: createFrames(playerBaseTexture, 80),
            walkUp: createFrames(playerBaseTexture, 160),
            walkDown: createFrames(playerBaseTexture, 224),
            attackUp: createFrames(playerBaseTexture, 304),
            attackDown: createFrames(playerBaseTexture, 368),
        },
        2: {
            idle: createFrames(playerRedBaseTexture, 80),
            walkUp: createFrames(playerRedBaseTexture, 160),
            walkDown: createFrames(playerRedBaseTexture, 224),
            attackUp: createFrames(playerRedBaseTexture, 304),
            attackDown: createFrames(playerRedBaseTexture, 368),
        },
        3: {
            idle: createFrames(playerGoldBaseTexture, 80),
            walkUp: createFrames(playerGoldBaseTexture, 160),
            walkDown: createFrames(playerGoldBaseTexture, 224),
            attackUp: createFrames(playerGoldBaseTexture, 304),
            attackDown: createFrames(playerGoldBaseTexture, 368),
        }
    }

    const cpuAnimsByRank: UnitAnimationsByRank = {
        1: {
            idle: createFrames(cpuBaseTexture, 80),
            walkUp: createFrames(cpuBaseTexture, 160),
            walkDown: createFrames(cpuBaseTexture, 224),
            attackUp: createFrames(cpuBaseTexture, 304),
            attackDown: createFrames(cpuBaseTexture, 368),
        },
        2: {
            idle: createFrames(cpuRedBaseTexture, 80),
            walkUp: createFrames(cpuRedBaseTexture, 160),
            walkDown: createFrames(cpuRedBaseTexture, 224),
            attackUp: createFrames(cpuRedBaseTexture, 304),
            attackDown: createFrames(cpuRedBaseTexture, 368),
        },
        3: {
            idle: createFrames(cpuGoldBaseTexture, 80),
            walkUp: createFrames(cpuGoldBaseTexture, 160),
            walkDown: createFrames(cpuGoldBaseTexture, 224),
            attackUp: createFrames(cpuGoldBaseTexture, 304),
            attackDown: createFrames(cpuGoldBaseTexture, 368),
        }
    }

    return { playerAnimsByRank, cpuAnimsByRank }
}
