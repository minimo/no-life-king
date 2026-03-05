<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as PIXI from 'pixi.js'
import { useGameStore, type Base, type Unit } from '~/stores/game'

const gameStore = useGameStore()
const canvasRef = ref<HTMLDivElement | null>(null)
let app: PIXI.Application | null = null
let dragLine: PIXI.Graphics | null = null
const draggingFromBaseId = ref<string | null>(null)
const targetedBaseId = ref<string | null>(null)
const multiSendTargetId = ref<string | null>(null)
const mousePos = ref({ x: 0, y: 0 })

let lastClickTime = 0
let lastClickedBaseId = ''
const DOUBLE_CLICK_THRESHOLD = 300

const OWNER_COLORS: Record<Owner, number> = {
  player: 0x3498db,
  cpu: 0xe74c3c,
  neutral: 0x95a5a6,
}

const ZONE_COLORS: Record<Owner, number> = {
  player: 0x1d272e, // Solid muted blue
  cpu: 0x2f1f1d,    // Solid muted red
  neutral: 0x1a1a1a,
}

// Isometric Coordinate Transformation Constants
const LOGICAL_SIZE = 800
const TILE_WIDTH_PX = 64
const TILE_HEIGHT_PX = 32
const ISO_CENTER_X = 960
const ISO_CENTER_Y = 540

// Scale 800 logical units to ~1600 pixels on screen (diagonal)
// So 1 logical unit = 2 pixels in full-width, or 1 pixel in half-width
const SCALE_X = 2.0 
const SCALE_Y = 1.0

function toIso(logicalX: number, logicalY: number) {
  // Center (400, 400) at (ISO_CENTER_X, ISO_CENTER_Y)
  const rx = logicalX - LOGICAL_SIZE / 2
  const ry = logicalY - LOGICAL_SIZE / 2
  
  // Iso formula: x = (rx - ry), y = (rx + ry) / 2
  // Then apply scaling
  const x = (rx - ry) * (SCALE_X / 2)
  const y = (rx + ry) * (SCALE_Y / 2)
  
  return {
    x: ISO_CENTER_X + x,
    y: ISO_CENTER_Y + y
  }
}

function fromIso(screenX: number, screenY: number) {
  const dx = screenX - ISO_CENTER_X
  const dy = screenY - ISO_CENTER_Y
  
  // rx - ry = dx / (SCALE_X / 2)
  // rx + ry = dy / (SCALE_Y / 2)
  const valA = dx / (SCALE_X / 2)
  const valB = dy / (SCALE_Y / 2)
  
  const rx = (valA + valB) / 2
  const ry = (valB - valA) / 2
  
  return { 
    x: rx + LOGICAL_SIZE / 2, 
    y: ry + LOGICAL_SIZE / 2 
  }
}

function createFrames(texture: PIXI.Texture, yOffset: number, count = 4) {
  const frames = []
  for (let i = 0; i < count; i++) {
    frames.push(new PIXI.Texture({
      source: texture.source,
      frame: new PIXI.Rectangle(i * 64, yOffset, 64, 64)
    }))
  }
  return frames
}

onMounted(async () => {
  if (!canvasRef.value) return

  console.log('Initializing Game Store...')
  gameStore.initGame()

  console.log('Initializing Pixi Application...')
  try {
    app = new PIXI.Application()
    await app.init({
      width: 1920,
      height: 1080,
      backgroundColor: 0x1a1a1a,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })
    console.log('Pixi initialized successfully')
  } catch (error) {
    console.error('Failed to initialize Pixi:', error)
    return
  }

  if (app && app.canvas) {
    app.canvas.style.width = '100%'
    app.canvas.style.height = '100%'
    app.canvas.style.display = 'block'
    canvasRef.value.appendChild(app.canvas)
  }

  // Load Assets
  const playerSpritesheetPath = `/assets/Denzi071022-2.png?t=${Date.now()}`
  const cpuSpritesheetPath = `/assets/Denzi071027-6.png?t=${Date.now()}`
  const mapTilesetPath = `/assets/Denzi111023-1_processed_v3.png?t=${Date.now()}`
  
  const [playerBaseTexture, cpuBaseTexture, mapTilesetTexture] = await Promise.all([
    PIXI.Assets.load(playerSpritesheetPath),
    PIXI.Assets.load(cpuSpritesheetPath),
    PIXI.Assets.load(mapTilesetPath)
  ])

  // Map Tile Textures
  // Grass tile: base grid is 32x16, let's use 0,0 but precise offset 16,16
  const grassTexture = new PIXI.Texture({
    source: mapTilesetTexture,
    frame: new PIXI.Rectangle(16 + 0 * 32, 16 + 0 * 16, 32, 16)
  })
  // Water tile: verified at X:0, Y:4
  const waterTexture = new PIXI.Texture({
    source: mapTilesetTexture,
    frame: new PIXI.Rectangle(16 + 0 * 32, 16 + 4 * 16, 32, 16)
  })
  // Mountain tile: 4 variations (0-1 are low, 2-3 are high). verified at X:0..3, Y:15 (tall, starts at Y:14)
  const mountainTextures = Array.from({length: 4}, (_, i) => new PIXI.Texture({
    source: mapTilesetTexture,
    frame: new PIXI.Rectangle(16 + i * 32, 16 + 14 * 16, 32, 32)
  }))
  // Wood tile: 11 variations. verified at X:0..10, Y:17 (tall, starts at Y:16)
  const woodTextures = Array.from({length: 11}, (_, i) => new PIXI.Texture({
    source: mapTilesetTexture,
    frame: new PIXI.Rectangle(16 + i * 32, 16 + 16 * 16, 32, 32)
  }))
  // Bridge tile: verified at X:3, Y:20
  const bridgeTexture = new PIXI.Texture({
    source: mapTilesetTexture,
    frame: new PIXI.Rectangle(16 + 3 * 32, 16 + 20 * 16, 32, 16)
  })

  // Buildings (at the bottom, safe area between the grid lines)
  // Building A (House): Block 0 (x=0). Center crop: x=8, y=312.
  const playerCoreTexture = new PIXI.Texture({
    source: mapTilesetTexture,
    frame: new PIXI.Rectangle(8, 312, 48, 48)
  })
  // CPU uses same house per user choice.
  const cpuCoreTexture = new PIXI.Texture({
    source: mapTilesetTexture,
    frame: new PIXI.Rectangle(8, 312, 48, 48)
  })
  // Building C (Church): Block 2 (x=128). Center crop: x=136, y=312.
  const neutralBaseTexture = new PIXI.Texture({
    source: mapTilesetTexture,
    frame: new PIXI.Rectangle(136, 312, 48, 48)
  })

  const playerAnimations = {
    idle: createFrames(playerBaseTexture, 80),
    walkUp: createFrames(playerBaseTexture, 160),
    walkDown: createFrames(playerBaseTexture, 224),
    attackUp: createFrames(playerBaseTexture, 304),
    attackDown: createFrames(playerBaseTexture, 368),
  }

  const cpuAnimations = {
    idle: createFrames(cpuBaseTexture, 80),
    walkUp: createFrames(cpuBaseTexture, 160),
    walkDown: createFrames(cpuBaseTexture, 224),
    attackUp: createFrames(cpuBaseTexture, 304),
    attackDown: createFrames(cpuBaseTexture, 368),
  }

  // Layer Containers for rendering order
  const mapLayer = new PIXI.Container()
  const zoneLayer = new PIXI.Container()
  const baseLayer = new PIXI.Container()
  const unitLayer = new PIXI.Container()
  const uiLayer = new PIXI.Container()

  app.stage.addChild(mapLayer)
  app.stage.addChild(zoneLayer)
  app.stage.addChild(baseLayer)
  app.stage.addChild(unitLayer)
  app.stage.addChild(uiLayer)

  // Render Static Map
  const STEP = 16 // Logical step for tiling
  for (let ly = 0; ly <= LOGICAL_SIZE; ly += STEP) {
    for (let lx = 0; lx <= LOGICAL_SIZE; lx += STEP) {
      const gridX = Math.round(lx / STEP)
      const gridY = Math.round(ly / STEP)
      const tileType = gameStore.mapGrid[gridY]?.[gridX] ?? 0

      let tex = grassTexture
      let isTall = false
      let needsGrassBase = false

      if (tileType === 1) { // Water
        tex = waterTexture
      } else if (tileType === 2 || (tileType >= 21 && tileType <= 24)) { // Mountain
        const v = tileType === 2 ? 0 : Math.min(3, tileType - 21)
        tex = mountainTextures[v] ?? mountainTextures[0]!
        isTall = true
      } else if (tileType === 3 || (tileType >= 31 && tileType <= 41)) { // Wood
        const v = tileType === 3 ? 0 : Math.min(10, tileType - 31)
        tex = woodTextures[v] ?? woodTextures[0]!
        isTall = true
        needsGrassBase = true
      } else if (tileType === 4) { // Bridge
        tex = bridgeTexture
      }

      const pos = toIso(lx, ly)

      if (needsGrassBase) {
        const baseTile = new PIXI.Sprite(grassTexture)
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
      } else {
        tile.anchor.set(0.5, 0.5)
        tile.scale.set(1.08) 
      }
      
      tile.x = pos.x
      tile.y = pos.y
      
      mapLayer.addChild(tile)
    }
  }

  dragLine = new PIXI.Graphics()
  uiLayer.addChild(dragLine)

  // Mapping from baseId/unitId to visuals for efficient updates
  const baseVisuals = new Map<string, { container: PIXI.Container, zone: PIXI.Graphics }>()
  const unitVisuals = new Map<string, { container: PIXI.Container, sprite: PIXI.AnimatedSprite, text: PIXI.Text }>()

  app.ticker.add((ticker) => {
    const deltaSeconds = ticker.deltaTime / 60
    gameStore.update(deltaSeconds)
    
    // Convert screen mouse pos to logical world pos for interaction
    const logicalMouse = fromIso(mousePos.value.x, mousePos.value.y)
    
    // Update targeted base
    if (draggingFromBaseId.value) {
      let closestBaseId: string | null = null
      let minDist = Infinity
      gameStore.bases.forEach((base: Base) => {
        const dist = Math.sqrt(Math.pow(base.x - logicalMouse.x, 2) + Math.pow(base.y - logicalMouse.y, 2))
        if (dist < minDist) {
          minDist = dist
          closestBaseId = base.id
        }
      })
      if (minDist <= gameStore.targetSelectThreshold) {
        targetedBaseId.value = closestBaseId
      } else {
        targetedBaseId.value = null
      }
    } else {
      targetedBaseId.value = null
    }

    // Render Bases
    gameStore.bases.forEach((base: Base) => {
      let visuals = baseVisuals.get(base.id)
      if (!visuals) {
        const container = new PIXI.Container()
        const pos = toIso(base.x, base.y)
        container.x = pos.x
        container.y = pos.y
        container.eventMode = 'static'
        container.cursor = 'pointer'

        container.on('pointerdown', () => {
          const now = Date.now()
          const isDoubleClick = (now - lastClickTime < DOUBLE_CLICK_THRESHOLD) && (lastClickedBaseId === base.id)
          
          if (isDoubleClick) {
            multiSendTargetId.value = base.id
            draggingFromBaseId.value = null
          } else if (base.owner === 'player') {
            draggingFromBaseId.value = base.id
            multiSendTargetId.value = null
          }
          
          lastClickTime = now
          lastClickedBaseId = base.id
        })

        const zone = new PIXI.Graphics()
        zone.x = pos.x
        zone.y = pos.y
        zoneLayer.addChild(zone)

        // Base Sprite from Tileset
        let texture = neutralBaseTexture
        if (base.isCore) {
          texture = base.owner === 'player' ? playerCoreTexture : cpuCoreTexture
        }
        
        const baseSprite = new PIXI.Sprite(texture)
        baseSprite.name = 'sprite'
        baseSprite.anchor.set(0.5, 0.8) // Align base of building to point
        baseSprite.scale.set(1.5)
        container.addChild(baseSprite)

        const text = new PIXI.Text({
          text: '0',
          style: {
            fontFamily: 'Arial',
            fontSize: 14,
            fill: 0xffffff,
            align: 'center',
            stroke: { color: 0x000000, width: 2 }
          },
        })
        text.name = 'text'
        text.anchor.set(0.5)
        text.y = -30
        container.addChild(text)

        const rankText = new PIXI.Text({
          text: '',
          style: {
            fontFamily: 'Arial',
            fontSize: 10,
            fill: 0xffffff,
          },
        })
        rankText.name = 'rank'
        rankText.anchor.set(0.5)
        rankText.y = -50
        container.addChild(rankText)

        baseLayer.addChild(container)
        visuals = { container, zone }
        baseVisuals.set(base.id, visuals)
      }

      const { container, zone } = visuals
      const sprite = container.getChildByName('sprite') as PIXI.Sprite
      const text = container.getChildByName('text') as PIXI.Text
      const rankText = container.getChildByName('rank') as PIXI.Text

      // Update texture if owner changed
      if (base.isCore) {
        sprite.texture = base.owner === 'player' ? playerCoreTexture : cpuCoreTexture
      } else {
        sprite.texture = neutralBaseTexture
      }
      // Tint based on owner for clarity
      sprite.tint = OWNER_COLORS[base.owner]

      zone.clear()
      if (base.owner !== 'neutral') {
        const pos = toIso(base.x, base.y)
        zone.x = pos.x
        zone.y = pos.y
        zone.beginPath()
        zone.fillStyle = ZONE_COLORS[base.owner]
        // Isometric circle is an ellipse matching the map scale
        zone.ellipse(0, 0, base.currentZoneRadius * (SCALE_X / 2), base.currentZoneRadius * (SCALE_Y / 2))
        zone.fill({ color: ZONE_COLORS[base.owner], alpha: 0.3 })
      }

      // Target & Source Highlights
      const isTarget = base.id === targetedBaseId.value || base.id === multiSendTargetId.value
      const isSource = base.id === draggingFromBaseId.value
      
      if (isTarget || isSource) {
        // Simple highlight circle/ellipse below building
        // Or we could add a stroke to the building sprite but that's messy with tints
      }

      text.text = Math.floor(base.production).toString()
      rankText.text = `R${base.rank}`
    })

    // Render Units
    // Cleanup old visuals
    const currentUnitIds = new Set(gameStore.units.map(u => u.id))
    for (const [id, visuals] of unitVisuals.entries()) {
      if (!currentUnitIds.has(id)) {
        visuals.container.destroy({ children: true })
        unitVisuals.delete(id)
      }
    }

    gameStore.units.forEach((unit: Unit) => {
      let visuals = unitVisuals.get(unit.id)
      
      if (!visuals) {
        const container = new PIXI.Container()
        const isPlayer = unit.owner === 'player'
        const anims = isPlayer ? playerAnimations : cpuAnimations
        
        const sprite = new PIXI.AnimatedSprite(anims.walkDown)
        sprite.anchor.set(0.5, 0.8)
        sprite.animationSpeed = 0.1
        sprite.play()
        sprite.scale.set(1.0) 
        
        container.addChild(sprite)

        const text = new PIXI.Text({
          text: Math.ceil(unit.power).toString(),
          style: { fontSize: 10, fill: 0xffffff, stroke: { color: 0x000000, width: 2 } }
        })
        text.anchor.set(0.5)
        text.y = -35
        container.addChild(text)
        
        unitLayer.addChild(container)
        visuals = { container, sprite, text }
        unitVisuals.set(unit.id, visuals)
      }

      const { container, sprite, text } = visuals
      const pos = toIso(unit.x, unit.y)
      container.x = pos.x
      container.y = pos.y
      container.zIndex = pos.y // Simple Y-sorting
      text.text = Math.ceil(unit.power).toString()

      if (sprite instanceof PIXI.AnimatedSprite) {
        // Determine Animation & Direction
        const source = gameStore.bases.find(b => b.id === unit.sourceId)
        const target = gameStore.bases.find(b => b.id === unit.targetId)
        
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
        
        const isPlayer = unit.owner === 'player'
        const anims = isPlayer ? playerAnimations : cpuAnimations
        
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
          sprite.play()
        }
      }
    })

    // Render Drag Line or Multi-Send Lines
    if (dragLine) {
      dragLine.clear()
      
      if (multiSendTargetId.value) {
        const target = gameStore.bases.find(b => b.id === multiSendTargetId.value)
        if (target) {
          gameStore.bases.filter(b => b.owner === 'player' && b.id !== target.id).forEach(source => {
            renderArrow(dragLine!, source, target, true, true)
          })
        }
      } else if (draggingFromBaseId.value) {
        const source = gameStore.bases.find((b: Base) => b.id === draggingFromBaseId.value)
        if (source) {
          const target = targetedBaseId.value ? gameStore.bases.find((b: Base) => b.id === targetedBaseId.value) : null
          // Supress if source and target are same
          if (!target || target.id !== source.id) {
            // mousePos is in screenspace, logical source.x/y is needed for consistency
            // renderArrow will handle the conversion
            renderArrow(dragLine!, source, target || fromIso(mousePos.value.x, mousePos.value.y), true, !!target)
          }
        }
      }
    }
  })

  function renderArrow(g: PIXI.Graphics, source: {x: number, y: number}, target: {x: number, y: number}, sourceIsBase = false, targetIsBase = false) {
    const sPos = toIso(source.x, source.y)
    const tPos = toIso(target.x, target.y)

    if (sPos.x === tPos.x && sPos.y === tPos.y) return

    const totalAngle = Math.atan2(tPos.y - sPos.y, tPos.x - sPos.x)
    const cos = Math.cos(totalAngle)
    const sin = Math.sin(totalAngle)

    let fromX = sPos.x
    let fromY = sPos.y
    if (sourceIsBase) {
      const t = 20 / Math.max(Math.abs(cos), Math.abs(sin))
      fromX = sPos.x + cos * t
      fromY = sPos.y + sin * t
    }

    let toX = tPos.x
    let toY = tPos.y
    if (targetIsBase) {
      const t = 20 / Math.max(Math.abs(cos), Math.abs(sin))
      toX = tPos.x - cos * t
      toY = tPos.y - sin * t
    }

    const dist = Math.hypot(toX - fromX, toY - fromY)
    if (dist <= 0) return

    const headLength = 20
    
    g.setStrokeStyle({ width: 5, color: 0x2ecc71, alpha: 0.8 })
    g.moveTo(fromX, fromY)
    g.lineTo(toX, toY)
    g.stroke()

    g.setStrokeStyle({ width: 0 })
    g.beginPath()
    g.fillStyle = 0x2ecc71
    g.moveTo(toX, toY)
    g.lineTo(toX - headLength * Math.cos(totalAngle - Math.PI / 6), toY - headLength * Math.sin(totalAngle - Math.PI / 6))
    g.lineTo(toX - headLength * Math.cos(totalAngle + Math.PI / 6), toY - headLength * Math.sin(totalAngle + Math.PI / 6))
    g.closePath()
    g.fill()
  }

  // Global mouse move and up
  if (app) {
    app.stage.eventMode = 'static'
    app.stage.hitArea = app.screen
    app.stage.sortableChildren = true // Enable sorting for unit zIndex
    
    app.stage.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
      const localPos = e.getLocalPosition(app!.stage)
      mousePos.value = { x: localPos.x, y: localPos.y }
      const logicalMouse = fromIso(localPos.x, localPos.y)

      if (multiSendTargetId.value) {
        const targetBase = gameStore.bases.find(b => b.id === multiSendTargetId.value)
        if (targetBase) {
          const dist = Math.sqrt(Math.pow(targetBase.x - logicalMouse.x, 2) + Math.pow(targetBase.y - logicalMouse.y, 2))
          if (dist > 30) { 
            multiSendTargetId.value = null
          }
        }
      }
    })
  }

  window.addEventListener('pointerup', handleGlobalPointerUp)
})

const handleGlobalPointerUp = () => {
  const logicalMouse = fromIso(mousePos.value.x, mousePos.value.y)
  
  if (multiSendTargetId.value) {
    const targetId = multiSendTargetId.value
    gameStore.bases.forEach(base => {
      if (base.owner === 'player' && base.id !== targetId) {
        gameStore.sendUnits(base.id, targetId)
      }
    })
    multiSendTargetId.value = null
  } else if (draggingFromBaseId.value) {
    let closestBase: any = null
    let minDist = Infinity

    gameStore.bases.forEach((base: Base) => {
      const dist = Math.sqrt(Math.pow(base.x - logicalMouse.x, 2) + Math.pow(base.y - logicalMouse.y, 2))
      if (dist < minDist) {
        minDist = dist
        closestBase = base
      }
    })

    if (closestBase && minDist <= gameStore.targetSelectThreshold) {
      gameStore.sendUnits(draggingFromBaseId.value, closestBase.id)
    }

    draggingFromBaseId.value = null
  }
}

onUnmounted(() => {
  window.removeEventListener('pointerup', handleGlobalPointerUp)
  if (app) {
    app.destroy(true, { children: true, texture: true })
  }
})
</script>

<template>
  <div class="game-container">
    <div ref="canvasRef" class="canvas-wrapper"></div>
    <div v-if="gameStore.isGameOver" class="overlay">
      <div class="modal">
        <h1>{{ gameStore.winner === 'player' ? 'Victory!' : 'Defeat...' }}</h1>
        <div class="modal-actions">
          <button @click="gameStore.initGame">Restart</button>
          <button @click="gameStore.backToTitle" class="secondary">Back to Title</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
  overflow: hidden;
}

.canvas-wrapper {
  width: 100%;
  max-width: 1920px;
  aspect-ratio: 1920 / 1080;
  box-shadow: 0 0 50px rgba(0,0,0,0.5);
  background: #111;
  border: 1px solid #333;
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
}

.modal {
  background: #2c3e50;
  padding: 2rem;
  border-radius: 1rem;
  text-align: center;
  color: white;
  border: 2px solid #3498db;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

button {
  margin-top: 1rem;
  padding: 0.5rem 2rem;
  font-size: 1.2rem;
  background: #3498db;
  border: none;
  color: white;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: transform 0.1s;
}

button.secondary {
  background: #7f8c8d;
}

button:hover {
  transform: scale(1.05);
  background: #2980b9;
}

button.secondary:hover {
  background: #95a5a6;
}
</style>
