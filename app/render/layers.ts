import * as PIXI from 'pixi.js'

export interface GameLayers {
    backgroundLayer: PIXI.Container
    mapLayer: PIXI.Container
    zoneLayer: PIXI.Container
    highlightLayer: PIXI.Container
    mainLayer: PIXI.Container
    uiLayer: PIXI.Container
    titleLayer: PIXI.Container
}

export function createLayers(stage: PIXI.Container): GameLayers {
    // Layer Containers for rendering order
    const backgroundLayer = new PIXI.Container()
    const mapLayer = new PIXI.Container()
    const zoneLayer = new PIXI.Container()
    const highlightLayer = new PIXI.Container()
    const mainLayer = new PIXI.Container() // Y-sorted layer for all tall objects
    const uiLayer = new PIXI.Container()
    const titleLayer = new PIXI.Container()

    mainLayer.sortableChildren = true

    stage.addChild(backgroundLayer)
    stage.addChild(mapLayer)
    stage.addChild(zoneLayer)
    stage.addChild(highlightLayer)
    stage.addChild(mainLayer)
    stage.addChild(uiLayer)
    stage.addChild(titleLayer)

    return {
        backgroundLayer,
        mapLayer,
        zoneLayer,
        highlightLayer,
        mainLayer,
        uiLayer,
        titleLayer,
    }
}

export function setGameplayVisibility(layers: GameLayers, visible: boolean) {
    layers.mapLayer.visible = visible
    layers.zoneLayer.visible = visible
    layers.highlightLayer.visible = visible
    layers.mainLayer.visible = visible
    layers.uiLayer.visible = visible
    layers.backgroundLayer.visible = visible
}
