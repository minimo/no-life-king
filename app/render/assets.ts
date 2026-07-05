import * as PIXI from 'pixi.js'

const assetVersion = () => Date.now()

const withCacheBust = (path: string, version: number) => `${path}?t=${version}`

export interface GameAssets {
    playerBaseTexture: PIXI.Texture
    playerRedBaseTexture: PIXI.Texture
    playerGoldBaseTexture: PIXI.Texture
    cpuBaseTexture: PIXI.Texture
    cpuRedBaseTexture: PIXI.Texture
    cpuGoldBaseTexture: PIXI.Texture
    mapTilesetTexture: PIXI.Texture
    skyTilesetTexture: PIXI.Texture
    titleBgTexture: PIXI.Texture
    reliefTexture: PIXI.Texture
    bgCursedMistTexture: PIXI.Texture
}

export async function loadGameAssets(): Promise<GameAssets> {
    const version = assetVersion()
    const [
        playerBaseTexture, playerRedBaseTexture, playerGoldBaseTexture,
        cpuBaseTexture, cpuRedBaseTexture, cpuGoldBaseTexture,
        mapTilesetTexture,
        skyTilesetTexture,
        titleBgTexture,
        reliefTexture,
        bgCursedMistTexture
    ] = await Promise.all([
        PIXI.Assets.load(withCacheBust('/assets/Denzi071022-2.png', version)),
        PIXI.Assets.load(withCacheBust('/assets/Denzi071022-2-red.png', version)),
        PIXI.Assets.load(withCacheBust('/assets/Denzi071022-2-gold.png', version)),
        PIXI.Assets.load(withCacheBust('/assets/Denzi071027-6.png', version)),
        PIXI.Assets.load(withCacheBust('/assets/Denzi071027-6-red.png', version)),
        PIXI.Assets.load(withCacheBust('/assets/Denzi071027-6-gold.png', version)),
        PIXI.Assets.load(withCacheBust('/assets/Denzi111023-1_processed_v3.png', version)),
        PIXI.Assets.load('/assets/Denzi100225-4.png'),
        PIXI.Assets.load('/images/title_bg.png'),
        PIXI.Assets.load('/assets/timedisplay_relief.png'),
        PIXI.Assets.load('/assets/bg_cursed_mist.png')
    ])

    return {
        playerBaseTexture,
        playerRedBaseTexture,
        playerGoldBaseTexture,
        cpuBaseTexture,
        cpuRedBaseTexture,
        cpuGoldBaseTexture,
        mapTilesetTexture,
        skyTilesetTexture,
        titleBgTexture,
        reliefTexture,
        bgCursedMistTexture,
    }
}
