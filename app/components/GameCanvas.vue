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
  
  const [playerBaseTexture, cpuBaseTexture] = await Promise.all([
    PIXI.Assets.load(playerSpritesheetPath),
    PIXI.Assets.load(cpuSpritesheetPath)
  ])

  function createFrames(texture: PIXI.Texture, yOffset: number, count = 4) {
    const frames = []
    for (let i = 0; i < count; i++) {
      frames.push(new PIXI.Texture({
        source: texture,
        frame: new PIXI.Rectangle(i * 64, yOffset, 64, 64)
      }))
    }
    return frames
  }

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
  const zoneLayer = new PIXI.Container()
  const baseLayer = new PIXI.Container()
  const unitLayer = new PIXI.Container()
  const uiLayer = new PIXI.Container()

  app.stage.addChild(zoneLayer)
  app.stage.addChild(baseLayer)
  app.stage.addChild(unitLayer)
  app.stage.addChild(uiLayer)

  dragLine = new PIXI.Graphics()
  uiLayer.addChild(dragLine)

  // Mapping from baseId/unitId to visuals for efficient updates
  const baseVisuals = new Map<string, { container: PIXI.Container, zone: PIXI.Graphics }>()
  const unitVisuals = new Map<string, { container: PIXI.Container, sprite: PIXI.AnimatedSprite, text: PIXI.Text }>()

  app.ticker.add((ticker) => {
    const deltaSeconds = ticker.deltaTime / 60
    gameStore.update(deltaSeconds)
    // Update targeted base
    if (draggingFromBaseId.value) {
      let closestBaseId: string | null = null
      let minDist = Infinity
      gameStore.bases.forEach((base: Base) => {
        const dist = Math.sqrt(Math.pow(base.x - mousePos.value.x, 2) + Math.pow(base.y - mousePos.value.y, 2))
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
        container.x = base.x
        container.y = base.y
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
        zone.x = base.x
        zone.y = base.y
        zoneLayer.addChild(zone)

        const rect = new PIXI.Graphics()
        rect.name = 'rect'
        container.addChild(rect)

        const text = new PIXI.Text({
          text: '0',
          style: {
            fontFamily: 'Arial',
            fontSize: 14,
            fill: 0xffffff,
            align: 'center',
          },
        })
        text.name = 'text'
        text.anchor.set(0.5)
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
        rankText.y = -20
        container.addChild(rankText)

        baseLayer.addChild(container)
        visuals = { container, zone }
        baseVisuals.set(base.id, visuals)
      }

      const { container, zone } = visuals
      const rect = container.getChildByName('rect') as PIXI.Graphics
      const text = container.getChildByName('text') as PIXI.Text
      const rankText = container.getChildByName('rank') as PIXI.Text

      zone.clear()
      if (base.owner !== 'neutral') {
        zone.beginPath()
        zone.fillStyle = ZONE_COLORS[base.owner]
        zone.circle(0, 0, base.currentZoneRadius)
        zone.fill() // Solid fill, no alpha
      }

      rect.clear()
      rect.beginPath()
      rect.fillStyle = OWNER_COLORS[base.owner]
      rect.rect(-16, -16, 32, 32)
      rect.fill()
      
      if (base.isCore) {
        rect.setStrokeStyle({ width: 2, color: 0xffffff })
        rect.rect(-18, -18, 36, 36)
        rect.stroke()
      }

      // Target & Source Highlights
      const isTarget = base.id === targetedBaseId.value || base.id === multiSendTargetId.value
      const isSource = base.id === draggingFromBaseId.value
      
      if (isTarget || isSource) {
        rect.setStrokeStyle({ width: 3, color: 0x2ecc71 })
        rect.rect(-20, -20, 40, 40)
        rect.stroke()
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
        sprite.anchor.set(0.5)
        sprite.animationSpeed = 0.1 // Slower animation
        sprite.play()
        sprite.scale.set(1.2) 
        
        container.addChild(sprite)

        const text = new PIXI.Text({
          text: Math.ceil(unit.power).toString(),
          style: { fontSize: 10, fill: 0xffffff }
        })
        text.anchor.set(0.5)
        text.y = -40 // Fixed for size
        container.addChild(text)
        
        unitLayer.addChild(container)
        visuals = { container, sprite, text }
        unitVisuals.set(unit.id, visuals)
      }

      const { container, sprite, text } = visuals
      container.x = unit.x
      container.y = unit.y
      text.text = Math.ceil(unit.power).toString()

      if (sprite instanceof PIXI.AnimatedSprite) {
        // Determine Animation & Direction
        const source = gameStore.bases.find(b => b.id === unit.sourceId)
        const target = gameStore.bases.find(b => b.id === unit.targetId)
        
        const isMovingRight = target && source ? target.x > source.x : false
        const isMovingUp = target && source ? target.y < source.y : false
        
        // Flip sprite for right movement (original is left-facing: scale.x = 1.2)
        sprite.scale.x = isMovingRight ? -1.2 : 1.2
        
        const isPlayer = unit.owner === 'player'
        const anims = isPlayer ? playerAnimations : cpuAnimations
        
        let targetAnim: any
        if (unit.isFighting) {
          // Row 2 (attackDown key mapping to Row 2 frames) for Up, Row 1 (attackUp key) for Down/Parallel
          targetAnim = isMovingUp ? anims.attackDown : anims.attackUp
        } else {
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
            renderArrow(dragLine!, source, target || mousePos.value, true, !!target)
          }
        }
      }
    }
  })

  function renderArrow(g: PIXI.Graphics, source: {x: number, y: number}, target: {x: number, y: number}, sourceIsBase = false, targetIsBase = false) {
    if (source.x === target.x && source.y === target.y) return

    const totalAngle = Math.atan2(target.y - source.y, target.x - source.x)
    const cos = Math.cos(totalAngle)
    const sin = Math.sin(totalAngle)

    let fromX = source.x
    let fromY = source.y
    if (sourceIsBase) {
      const t = 20 / Math.max(Math.abs(cos), Math.abs(sin))
      fromX = source.x + cos * t
      fromY = source.y + sin * t
    }

    let toX = target.x
    let toY = target.y
    if (targetIsBase) {
      const t = 20 / Math.max(Math.abs(cos), Math.abs(sin))
      toX = target.x - cos * t
      toY = target.y - sin * t
    }

    // Stop if the line length becomes negative or zero due to snapping
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
    app.stage.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
      // Use local position relative to stage
      const localPos = e.getLocalPosition(app!.stage)
      mousePos.value = { x: localPos.x, y: localPos.y }

      if (multiSendTargetId.value) {
        const targetBase = gameStore.bases.find(b => b.id === multiSendTargetId.value)
        if (targetBase) {
          const dist = Math.sqrt(Math.pow(targetBase.x - localPos.x, 2) + Math.pow(targetBase.y - localPos.y, 2))
          // Cancel if pointer leaves the base area (radius 16px, using 20px buffer)
          if (dist > 25) { 
            multiSendTargetId.value = null
          }
        }
      }
    })
  }

  window.addEventListener('pointerup', handleGlobalPointerUp)
})

const handleGlobalPointerUp = () => {
  if (multiSendTargetId.value) {
    const targetId = multiSendTargetId.value
    gameStore.bases.forEach(base => {
      if (base.owner === 'player' && base.id !== targetId) {
        gameStore.sendUnits(base.id, targetId)
      }
    })
    multiSendTargetId.value = null
  } else if (draggingFromBaseId.value) {
    // Find closest base within threshold
    let closestBase: any = null
    let minDist = Infinity

    gameStore.bases.forEach((base: Base) => {
      const dist = Math.sqrt(Math.pow(base.x - mousePos.value.x, 2) + Math.pow(base.y - mousePos.value.y, 2))
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
