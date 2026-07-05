import * as PIXI from 'pixi.js'
import { LOGICAL_SIZE, toIso } from './coords'
import type { TileTextures } from './textureUtils'

export function renderStaticMap(mapGrid: number[][], mapLayer: PIXI.Container, mainLayer: PIXI.Container, textures: TileTextures) {
    // Render Static Map
    const STEP = 16 // Logical step for tiling
    for (let ly = 0; ly <= LOGICAL_SIZE; ly += STEP) {
        for (let lx = 0; lx <= LOGICAL_SIZE; lx += STEP) {
            const gridX = Math.round(lx / STEP)
            const gridY = Math.round(ly / STEP)
            const tileType = mapGrid[gridY]?.[gridX] ?? 0

            let tex = textures.grassTexture
            let isTall = false
            let needsGrassBase = false
            let needsWaterBase = false

            if (tileType === 1) { // Water
                tex = textures.waterTexture
            } else if (tileType === 2 || (tileType >= 21 && tileType <= 24)) { // Mountain
                const v = tileType === 2 ? 0 : Math.min(3, tileType - 21)
                tex = textures.mountainTextures[v] ?? textures.mountainTextures[0]!
                isTall = true
            } else if (tileType === 3 || (tileType >= 31 && tileType <= 41)) { // Wood
                const v = tileType === 3 ? 0 : Math.min(10, tileType - 31)
                tex = textures.woodTextures[v] ?? textures.woodTextures[0]!
                isTall = true
                needsGrassBase = true
            } else if (tileType === 4) { // Bridge
                // Determine direction by checking adjacent water on X axis
                const isRiverX = mapGrid[gridY]?.[gridX - 1] === 1 || mapGrid[gridY]?.[gridX + 1] === 1
                // If river is X axis, it flows Top-Left to Bottom-Right. Bridge crosses over it (Bottom-Left to Top-Right -> Bridge Y)
                tex = isRiverX ? textures.bridgeYTexture : textures.bridgeXTexture
                needsWaterBase = true
            }

            const pos = toIso(lx, ly)

            if (needsWaterBase) {
                const baseTile = new PIXI.Sprite(textures.waterTexture)
                baseTile.anchor.set(0.5, 0.5)
                baseTile.scale.set(1.08)
                baseTile.x = pos.x
                baseTile.y = pos.y
                mapLayer.addChild(baseTile)
            }

            if (needsGrassBase) {
                const baseTile = new PIXI.Sprite(textures.grassTexture)
                baseTile.anchor.set(0.5, 0.5)
                baseTile.scale.set(1.08)
                baseTile.x = pos.x
                baseTile.y = pos.y
                mapLayer.addChild(baseTile)
            }

            const tile = new PIXI.Sprite(tex)

            if (isTall) {
                // Taller sprites need to anchor to their bottom to sit on the isometric cell
                tile.anchor.set(0.5, 0.75)
                // Since original logic scales grass by 1.08, let's scale tall sprites up slightly too
                tile.scale.set(1.5)

                tile.x = pos.x
                tile.y = pos.y
                tile.zIndex = pos.y // Set zIndex for Y-sorting in mainLayer
                mainLayer.addChild(tile)
            } else {
                tile.anchor.set(0.5, 0.5)
                tile.scale.set(1.08)
                tile.x = pos.x
                tile.y = pos.y
                mapLayer.addChild(tile)
            }
        }
    }
}
