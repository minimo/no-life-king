<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue'
import * as PIXI from 'pixi.js'
import { useGameStore, RANK_CONFIG } from '~/stores/game'
import type { Base, Unit, Owner, Rank } from '~/stores/game'

// Constants
const LOGICAL_SIZE = 800
const DOUBLE_CLICK_THRESHOLD = 300 // ms
const LONG_PRESS_THRESHOLD = 500 // ms
const SCALE_X = 2.0
const SCALE_Y = 1.0

const gameStore = useGameStore()
const canvasRef = ref<HTMLElement | null>(null)
const contextMenuRef = ref<HTMLElement | null>(null)
const mousePos = ref({ x: 0, y: 0 })
const pointerDownPos = ref({ x: 0, y: 0 })
const pointerDownEntityId = ref<string | null>(null)
const draggingFromBaseId = ref<string | null>(null)
const targetedBaseId = ref<string | null>(null)
const multiSendTargetId = ref<string | null>(null)
const selectedUnitId = ref<string | null>(null)
const menuJustOpened = ref(false)

// Context Menu State
const contextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  type: 'base' | 'unit' | null;
  targetId: string | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  type: null,
  targetId: null
})

const upgradeCost = computed(() => {
  if (contextMenu.value.type !== 'base' || !contextMenu.value.targetId) return 0
  const base = gameStore.bases.find((b: Base) => b.id === contextMenu.value.targetId)
  if (!base || base.rank >= 3) return 0
  return RANK_CONFIG[base.rank].upgradeCost
})

const canUpgradeTargetBase = computed(() => {
  if (contextMenu.value.type !== 'base' || !contextMenu.value.targetId) return false
  const base = gameStore.bases.find((b: Base) => b.id === contextMenu.value.targetId)
  if (!base || base.rank >= 3) return false
  return base.production >= upgradeCost.value
})

let app: PIXI.Application | null = null
let dragLine: PIXI.Graphics | null = null
let lastClickTime = 0
let lastClickedBaseId = ''
let longPressTimeout: ReturnType<typeof setTimeout> | null = null

const OWNER_COLORS: Record<Owner, number> = {
  player: 0x3498db,
  cpu: 0xe74c3c,
  neutral: 0x95a5a6,
}

const DARK_OWNER_COLORS: Record<Owner, number> = {
  player: 0x1f5a82, // Darker blue
  cpu: 0x8a2d24,    // Darker red
  neutral: 0x596363, // Darker gray
}

// 村の屋根の色彩変更：描画の不具合（シェーダー/フィルタの干渉）を避けるため、
// 実行時に個別のテクスチャを事前生成する方式を採用しています。

const ZONE_COLORS: Record<Owner, number> = {
  player: 0x3498db, // Bright blue
  cpu: 0xff1111,    // Vivid red (to avoid looking yellow)
  neutral: 0x95a5a6,
}

// Isometric Coordinate Transformation Constants
const TILE_WIDTH_PX = 64
const TILE_HEIGHT_PX = 32
const ISO_CENTER_X = 960
const ISO_CENTER_Y = 540
// ハイライト楕円のパラメータ（スクリーン座標）
const HIGHLIGHT_HW = 28   // 横半径
const HIGHLIGHT_HH = 20   // 縦半径
const HIGHLIGHT_OFFSET_Y = -8 // 楕円中心のY方向オフセット

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

const effectLayer = new PIXI.Container() // For floating texts

function createFloatingText(text: string, x: number, y: number, color: number = 0xffff00) {
  if (!app) return

  const label = new PIXI.Text({
    text,
    style: {
      fontFamily: 'Arial',
      fontSize: 20,
      fontWeight: 'bold',
      fill: color,
      stroke: { color: 0x000000, width: 4 },
    }
  })
  label.anchor.set(0.5)
  label.x = x
  label.y = y
  effectLayer.addChild(label)

  let elapsed = 0
  const duration = 1.0
  const ticker = (t: PIXI.Ticker) => {
    const dt = t.deltaTime / 60
    elapsed += dt
    label.y -= 40 * dt
    label.alpha = 1 - (elapsed / duration)
    if (elapsed >= duration) {
      app?.ticker.remove(ticker)
      label.destroy()
    }
  }
  app.ticker.add(ticker)
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
  // Bridge textures (32x32 at y=320 row, 4th and 5th slots)
  // Bridge Y (Slot 4, x=112): Bottom-Left to Top-Right
  const bridgeYTexture = new PIXI.Texture({
    source: mapTilesetTexture,
    frame: new PIXI.Rectangle(112, 320, 32, 32)
  })
  // Bridge X (Slot 5, x=144): Top-Left to Bottom-Right
  const bridgeXTexture = new PIXI.Texture({
    source: mapTilesetTexture,
    frame: new PIXI.Rectangle(144, 320, 32, 32)
  })

  // Buildings: 32x32 sprites at y=320 row (grid row 19-20)
  // Building A (城): col 0 → (16, 320)
  const baseRank3Texture = new PIXI.Texture({
    source: mapTilesetTexture,
    frame: new PIXI.Rectangle(16, 320, 32, 32)
  })
  // Building B (砦): col 1 → (48, 320)
  const baseRank2Texture = new PIXI.Texture({
    source: mapTilesetTexture,
    frame: new PIXI.Rectangle(48, 320, 32, 32)
  })
  // Building C (集落): col 2 → (80, 320)
  const baseRank1Texture = new PIXI.Texture({
    source: mapTilesetTexture,
    frame: new PIXI.Rectangle(80, 320, 32, 32)
  })

  function getBaseTexture(base: Base) {
    if (base.isCore || base.rank >= 3) return baseRank3Texture
    if (base.rank === 2) return baseRank2Texture
    return baseRank1Texture
  }

  // ドット絵風の旗テクスチャを作成する関数
  function createFlagTexture(teamColor: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    
    // チームカラーの分解
    const r = (teamColor >> 16) & 0xFF;
    const g = (teamColor >> 8) & 0xFF;
    const b = teamColor & 0xFF;

    // ポール部分（ドット絵風 12px）
    ctx.fillStyle = '#333333';
    ctx.fillRect(7, 20, 2, 12); // メインの柱
    ctx.fillStyle = '#666666';
    ctx.fillRect(7, 20, 1, 12); // ハイライト

    // 旗の布部分（ドット絵風の三角形、サイズ維持）
    // アウトライン
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(8, 20);
    ctx.lineTo(16, 24);
    ctx.lineTo(8, 28);
    ctx.fill();

    // メインカラー
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.moveTo(9, 21);
    ctx.lineTo(14, 24);
    ctx.lineTo(9, 27);
    ctx.fill();

    // 陰影（下部）
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.moveTo(9, 25);
    ctx.lineTo(14, 24);
    ctx.lineTo(9, 27);
    ctx.fill();

    return PIXI.Texture.from(canvas);
  }

  // 各勢力ごとの旗テクスチャを事前生成
  const flagPlayerTexture = createFlagTexture(OWNER_COLORS.player);
  const flagCpuTexture = createFlagTexture(OWNER_COLORS.cpu);

  // 村の屋根の色を置換したテクスチャを作成する関数
  function createVillageTexture(sourceTexture: PIXI.Texture, targetRGB: [number, number, number]) {
    // 一時的なCanvasを使用してピクセルデータを抽出
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    
    // 元のテクスチャをCanvasに描画
    const baseSource = sourceTexture.source.resource as HTMLImageElement;
    const frame = sourceTexture.frame;
    ctx.drawImage(baseSource, frame.x, frame.y, frame.width, frame.height, 0, 0, 32, 32);
    
    const imageData = ctx.getImageData(0, 0, 32, 32);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]! / 255;
      const g = data[i+1]! / 255;
      const b = data[i+2]! / 255;
      
      // 屋根の赤色部分を詳細に判定
      if (r > g * 1.4 && r > b * 1.4 && r > 0.3) {
        data[i] = targetRGB[0] * r * 255;
        data[i+1] = targetRGB[1] * r * 255;
        data[i+2] = targetRGB[2] * r * 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return PIXI.Texture.from(canvas);
  }

  // 各所有者ごとの村テクスチャを事前生成
  const villageNeutralTexture = createVillageTexture(baseRank1Texture, [0.7, 0.7, 0.7]); // 灰色
  const villagePlayerTexture = createVillageTexture(baseRank1Texture, [0.2, 0.6, 1.0]);  // 青色
  const villageCpuTexture = baseRank1Texture; // デフォルト（赤色）

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
  const highlightLayer = new PIXI.Container()
  const baseLayer = new PIXI.Container()
  const unitLayer = new PIXI.Container()
  const uiLayer = new PIXI.Container()

  app.stage.addChild(mapLayer)
  app.stage.addChild(zoneLayer)
  app.stage.addChild(highlightLayer)
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
      let needsWaterBase = false

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
        // Determine direction by checking adjacent water on X axis
        const isRiverX = gameStore.mapGrid[gridY]?.[gridX - 1] === 1 || gameStore.mapGrid[gridY]?.[gridX + 1] === 1
        // If river is X axis, it flows Top-Left to Bottom-Right. Bridge crosses over it (Bottom-Left to Top-Right -> Bridge Y)
        tex = isRiverX ? bridgeYTexture : bridgeXTexture
        needsWaterBase = true
      }

      const pos = toIso(lx, ly)

      if (needsWaterBase) {
        const baseTile = new PIXI.Sprite(waterTexture)
        baseTile.anchor.set(0.5, 0.5)
        baseTile.scale.set(1.08)
        baseTile.x = pos.x
        baseTile.y = pos.y
        mapLayer.addChild(baseTile)
      }

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
  highlightLayer.addChild(dragLine)

  const unitPathGfx = new PIXI.Graphics()
  highlightLayer.addChild(unitPathGfx)

  // Mapping from baseId/unitId to visuals for efficient updates
  const baseVisuals = new Map<string, { container: PIXI.Container, zone: PIXI.Graphics, highlight: PIXI.Graphics }>()
  const unitVisuals = new Map<string, { container: PIXI.Container, sprite: PIXI.AnimatedSprite, text: PIXI.Text }>()
  uiLayer.addChild(effectLayer)

  // 夜間の暗さを計算する関数（0〜0.5）
  function getNightAlpha(dayTime: number): number {
    // 06:00〜17:00 (360〜1020): 昼（明るい）
    if (dayTime >= 360 && dayTime < 1020) return 0
    // 17:00〜18:00 (1020〜1080): 夕暮れ遷移
    if (dayTime >= 1020 && dayTime < 1080) return ((dayTime - 1020) / 60) * 0.5
    // 18:00〜翌05:00 (1080〜300): 夜（最大の暗さ）
    if (dayTime >= 1080 || dayTime < 300) return 0.5
    // 05:00〜06:00 (300〜360): 夜明け遷移
    if (dayTime >= 300 && dayTime < 360) return ((360 - dayTime) / 60) * 0.5
    return 0
  }

  // 夜間の暗さからtint値を計算（暗い紺色への遷移）
  function getNightTint(dayTime: number): number {
    const alpha = getNightAlpha(dayTime)
    if (alpha <= 0) return 0xffffff
    // R,Gチャンネルをやや減衰、Bチャンネルは控えめに減衰させ夜の雰囲気を出す
    const r = Math.round(255 * (1 - alpha * 0.9))
    const g = Math.round(255 * (1 - alpha * 0.9))
    const b = Math.round(255 * (1 - alpha * 0.5))
    return (Math.max(0, r) << 16) | (Math.max(0, g) << 8) | Math.max(0, b)
  }

  app.ticker.add((ticker) => {
    const deltaSeconds = ticker.deltaTime / 60
    gameStore.update(deltaSeconds)

    // 夜間tintの計算（マップオブジェクトのみに適用、UIテキストは対象外）
    const nightTint = getNightTint(gameStore.dayTime)
    mapLayer.tint = nightTint
    zoneLayer.tint = nightTint
    
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

        container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
          if (longPressTimeout) {
            clearTimeout(longPressTimeout)
            longPressTimeout = null
          }
          
          pointerDownPos.value = { x: e.clientX, y: e.clientY }
          
          const now = Date.now()
          const isDoubleClick = (now - lastClickTime < DOUBLE_CLICK_THRESHOLD) && (lastClickedBaseId === base.id)
          
          if (isDoubleClick) {
            multiSendTargetId.value = base.id
            draggingFromBaseId.value = null
            pointerDownEntityId.value = null // Cancel context menu for this double click
          } else if (base.owner === 'player') {
            pointerDownEntityId.value = base.id // ALLOW MENU ONLY FOR PLAYER BASES
            draggingFromBaseId.value = base.id
            multiSendTargetId.value = null
            
            // start long press timeout
            const clickX = e.clientX
            const clickY = e.clientY
            longPressTimeout = setTimeout(() => {
                longPressTimeout = null
                openContextMenuFunc('base', base.id, clickX, clickY)
            }, LONG_PRESS_THRESHOLD)
          } else {
            pointerDownEntityId.value = null
          }
          selectedUnitId.value = null
          
          lastClickTime = now
          lastClickedBaseId = base.id
        })

        const zone = new PIXI.Graphics()
        zone.x = pos.x
        zone.y = pos.y
        zoneLayer.addChild(zone)

        const highlight = new PIXI.Graphics()
        container.addChild(highlight)

        // Base Sprite from Tileset
        const baseSprite = new PIXI.Sprite(getBaseTexture(base))
        baseSprite.name = 'sprite'
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
        text.name = 'text'
        container.addChild(text)

        const flag = new PIXI.Sprite()
        flag.anchor.set(0.5, 1.0) // ポールの下端を基準にする
        flag.name = 'flag'
        container.addChild(flag)

        baseLayer.addChild(container)
        visuals = { container, zone, highlight }
        baseVisuals.set(base.id, visuals)
      }

      const { container, zone, highlight } = visuals
      const sprite = container.getChildByName('sprite') as PIXI.Sprite
      const text = container.getChildByName('text') as PIXI.Text
      const flagSprite = container.getChildByName('flag') as PIXI.Sprite

      // 所有者とランクに基づいてテクスチャを更新
      if (base.isCore || base.rank >= 3) {
        sprite.texture = baseRank3Texture
      } else if (base.rank === 2) {
        sprite.texture = baseRank2Texture
      } else {
        // 村（Rank 1 かつ本拠地でない場合）
        if (base.owner === 'player') {
          sprite.texture = villagePlayerTexture
        } else if (base.owner === 'neutral') {
          sprite.texture = villageNeutralTexture
        } else {
          sprite.texture = villageCpuTexture
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
        flagSprite.texture = base.owner === 'player' ? flagPlayerTexture : flagCpuTexture
        
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
      const isTarget = base.id === targetedBaseId.value || base.id === multiSendTargetId.value
      const isSource = base.id === draggingFromBaseId.value
        || (multiSendTargetId.value !== null && base.owner === 'player' && base.id !== multiSendTargetId.value)
      
      highlight.clear()
      if (isTarget || isSource) {
        // 砦の周囲に緑色の楕円枠を描画
        highlight.setStrokeStyle({ width: 3, color: 0x2ecc71, alpha: 0.9 })
        highlight.ellipse(0, HIGHLIGHT_OFFSET_Y, HIGHLIGHT_HW, HIGHLIGHT_HH)
        highlight.stroke()
      }

      text.text = Math.floor(base.production).toString()
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

        // ユニットクリックで選択
        container.eventMode = 'static'
        container.cursor = 'pointer'
        container.hitArea = new PIXI.Circle(0, -20, 20)
        container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
          e.stopPropagation()
          pointerDownPos.value = { x: e.clientX, y: e.clientY }
          selectedUnitId.value = selectedUnitId.value === unit.id ? null : unit.id
          
          if (longPressTimeout) {
            clearTimeout(longPressTimeout)
            longPressTimeout = null
          }

          if (unit.owner === 'player') {
             pointerDownEntityId.value = `unit:${unit.id}`
             const clickX = e.clientX
             const clickY = e.clientY
             longPressTimeout = setTimeout(() => {
                longPressTimeout = null
                openContextMenuFunc('unit', unit.id, clickX, clickY)
             }, LONG_PRESS_THRESHOLD)
          } else {
             pointerDownEntityId.value = null
          }
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
      
      // 所有者のチームカラーに基づいて縁取りを更新
      const strokeColor = unit.owner === 'player' ? OWNER_COLORS.player : OWNER_COLORS.cpu
      text.style.fill = 0xffffff
      text.style.stroke = { color: strokeColor, width: 2 }
      text.style.fontSize = 14

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
        sprite.tint = nightTint // 夜間tintをユニットスプライトに適用
        
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
        }

        if (gameStore.status === 'playing') {
          if (!sprite.playing) sprite.play()
        } else {
          if (sprite.playing) sprite.stop()
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

    // Render selected unit path
    unitPathGfx.clear()
    if (selectedUnitId.value) {
      const selUnit = gameStore.units.find(u => u.id === selectedUnitId.value)
      if (selUnit && selUnit.path.length > 1) {
        const color = OWNER_COLORS[selUnit.owner]
        const darkColor = DARK_OWNER_COLORS[selUnit.owner]
        const selVisuals = unitVisuals.get(selUnit.id)

        // 選択枠（楕円）
        if (selVisuals) {
          const uPos = toIso(selUnit.x, selUnit.y)
          unitPathGfx.setStrokeStyle({ width: 5, color: darkColor, alpha: 1.0 }) // 暗い縁
          unitPathGfx.ellipse(uPos.x, uPos.y + HIGHLIGHT_OFFSET_Y, 16, 12)
          unitPathGfx.stroke()
          
          unitPathGfx.setStrokeStyle({ width: 3, color, alpha: 1.0 })
          unitPathGfx.ellipse(uPos.x, uPos.y + HIGHLIGHT_OFFSET_Y, 16, 12)
          unitPathGfx.stroke()
        }

        // 目標拠点の枠
        const targetBase = gameStore.bases.find(b => b.id === selUnit.targetId)
        if (targetBase) {
          const tPos = toIso(targetBase.x, targetBase.y)
          unitPathGfx.setStrokeStyle({ width: 5, color: darkColor, alpha: 1.0 }) // 暗い縁
          unitPathGfx.ellipse(tPos.x, tPos.y + HIGHLIGHT_OFFSET_Y, HIGHLIGHT_HW, HIGHLIGHT_HH)
          unitPathGfx.stroke()

          unitPathGfx.setStrokeStyle({ width: 3, color, alpha: 1.0 })
          unitPathGfx.ellipse(tPos.x, tPos.y + HIGHLIGHT_OFFSET_Y, HIGHLIGHT_HW, HIGHLIGHT_HH)
          unitPathGfx.stroke()
        }

        // パスルート描画（枠から枠まで）
        const startIdx = selUnit.pathIndex
        const startIso = toIso(selUnit.x, selUnit.y)

        // 全ウェイポイントをISO座標に変換
        const isoPoints: { x: number; y: number }[] = [startIso]
        for (let pi = startIdx + 1; pi < selUnit.path.length; pi++) {
          const wp = selUnit.path[pi]!
          isoPoints.push(toIso(wp.x, wp.y))
        }

        if (isoPoints.length >= 2) {
          // 楕円が接触していたら線と矢印を省略
          const lastPt = isoPoints[isoPoints.length - 1]!
          const distBetween = Math.hypot(lastPt.x - startIso.x, (lastPt.y + HIGHLIGHT_OFFSET_Y) - (startIso.y + HIGHLIGHT_OFFSET_Y))
          const touchThreshold = (16 + HIGHLIGHT_HW) // ユニット楕円横半径 + 目標楕円横半径
          if (distBetween > touchThreshold) {
            // 始点: ユニット楕円の外周から
            const firstNext = isoPoints[1]!
            const startAngle = Math.atan2(firstNext.y - (startIso.y + HIGHLIGHT_OFFSET_Y), firstNext.x - startIso.x)
            const startEdge = ellipseEdge(startIso.x, startIso.y + HIGHLIGHT_OFFSET_Y, 16, 12, startAngle)

            // 終点: 目標拠点の楕円外周まで
            const prevPt = isoPoints[isoPoints.length - 2]!
            const endAngle = Math.atan2(prevPt.y - (lastPt.y + HIGHLIGHT_OFFSET_Y), prevPt.x - lastPt.x)
            const endEdge = targetBase
              ? ellipseEdge(lastPt.x, lastPt.y + HIGHLIGHT_OFFSET_Y, HIGHLIGHT_HW, HIGHLIGHT_HH, endAngle)
              : lastPt

            // 線を描画（暗い縁）
            unitPathGfx.setStrokeStyle({ width: 7, color: darkColor, alpha: 1.0 })
            unitPathGfx.moveTo(startEdge.x, startEdge.y)
            for (let pi = 1; pi < isoPoints.length - 1; pi++) {
              unitPathGfx.lineTo(isoPoints[pi]!.x, isoPoints[pi]!.y)
            }
            unitPathGfx.lineTo(endEdge.x, endEdge.y)
            unitPathGfx.stroke()

            // 線を描画（メイン）
            unitPathGfx.setStrokeStyle({ width: 5, color, alpha: 1.0 })
            unitPathGfx.moveTo(startEdge.x, startEdge.y)
            for (let pi = 1; pi < isoPoints.length - 1; pi++) {
              unitPathGfx.lineTo(isoPoints[pi]!.x, isoPoints[pi]!.y)
            }
            unitPathGfx.lineTo(endEdge.x, endEdge.y)
            unitPathGfx.stroke()

            // 終端の矢印
            const arrowAngle = Math.atan2(endEdge.y - prevPt.y, endEdge.x - prevPt.x)
            const headLen = 16
            const p1x = endEdge.x, p1y = endEdge.y
            const p2x = endEdge.x - headLen * Math.cos(arrowAngle - Math.PI / 6)
            const p2y = endEdge.y - headLen * Math.sin(arrowAngle - Math.PI / 6)
            const p3x = endEdge.x - headLen * Math.cos(arrowAngle + Math.PI / 6)
            const p3y = endEdge.y - headLen * Math.sin(arrowAngle + Math.PI / 6)

            // 暗い縁（後端は線分と接触する部分を開ける）
            const baseLen = Math.hypot(p3x - p2x, p3y - p2y)
            const gap = 6 // パスの縁取り幅(7)より少し小さめにして隙間を防ぐ
            const ratio = Math.max(0, (baseLen - gap) / 2 / baseLen)
            const p2_inner_x = p2x + (p3x - p2x) * ratio
            const p2_inner_y = p2y + (p3y - p2y) * ratio
            const p3_inner_x = p3x + (p2x - p3x) * ratio
            const p3_inner_y = p3y + (p2y - p3y) * ratio

            unitPathGfx.setStrokeStyle({ width: 3, color: darkColor, alpha: 1.0, join: 'round' })
            unitPathGfx.beginPath()
            unitPathGfx.moveTo(p2_inner_x, p2_inner_y)
            unitPathGfx.lineTo(p2x, p2y)
            unitPathGfx.lineTo(p1x, p1y)
            unitPathGfx.lineTo(p3x, p3y)
            unitPathGfx.lineTo(p3_inner_x, p3_inner_y)
            unitPathGfx.stroke()

            // メイン色塗りつぶし
            unitPathGfx.setStrokeStyle({ width: 0 })
            unitPathGfx.beginPath()
            unitPathGfx.moveTo(p1x, p1y)
            unitPathGfx.lineTo(p2x, p2y)
            unitPathGfx.lineTo(p3x, p3y)
            unitPathGfx.closePath()
            unitPathGfx.fill({ color, alpha: 1.0 })
          }
        }
      } else {
        // ユニットが消えたら選択解除
        selectedUnitId.value = null
      }
    }
  })

  /** 楕円外周上の点を求める: 楕円中心から角度 angle 方向の外周座標を返す */
  function ellipseEdge(cx: number, cy: number, a: number, b: number, angle: number) {
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    // 楕円 x²/a² + y²/b² = 1 と原点からの直線の交点距離
    const r = 1 / Math.sqrt((cosA * cosA) / (a * a) + (sinA * sinA) / (b * b))
    return { x: cx + r * cosA, y: cy + r * sinA }
  }

  function renderArrow(g: PIXI.Graphics, source: {x: number, y: number}, target: {x: number, y: number}, sourceIsBase = false, targetIsBase = false) {
    const sPos = toIso(source.x, source.y)
    const tPos = toIso(target.x, target.y)

    // 楕円中心（Y方向にオフセット）
    const sCx = sPos.x, sCy = sPos.y + HIGHLIGHT_OFFSET_Y
    const tCx = tPos.x, tCy = tPos.y + HIGHLIGHT_OFFSET_Y

    if (sCx === tCx && sCy === tCy) return

    const color = 0x2ecc71
    const darkColor = 0x1a8a4a

    // ターゲットが拠点の場合はA*パスを使用、そうでない場合は直線
    if (targetIsBase && sourceIsBase) {
      // A*パスを取得（プレイヤーの経路コストで計算）
      const pathPoints = gameStore.getPath(source.x, source.y, target.x, target.y, 'player')

      // パスをISO座標に変換
      const isoPoints: { x: number; y: number }[] = pathPoints.map(p => toIso(p.x, p.y))

      if (isoPoints.length < 2) return

      // 始点: ソース楕円の外周から
      const firstNext = isoPoints[1]!
      const startAngle = Math.atan2(firstNext.y - sCy, firstNext.x - sCx)
      const startEdge = ellipseEdge(sCx, sCy, HIGHLIGHT_HW, HIGHLIGHT_HH, startAngle)

      // 終点: ターゲット楕円の外周まで
      const lastPt = isoPoints[isoPoints.length - 1]!
      const prevPt = isoPoints[isoPoints.length - 2]!
      const endAngle = Math.atan2(prevPt.y - (lastPt.y + HIGHLIGHT_OFFSET_Y), prevPt.x - lastPt.x)
      const endEdge = ellipseEdge(tCx, tCy, HIGHLIGHT_HW, HIGHLIGHT_HH, endAngle)

      // 距離が近すぎる場合は省略
      const distBetween = Math.hypot(endEdge.x - startEdge.x, endEdge.y - startEdge.y)
      if (distBetween <= 0) return

      // 線を描画（暗い縁取り）
      g.setStrokeStyle({ width: 7, color: darkColor, alpha: 0.8 })
      g.moveTo(startEdge.x, startEdge.y)
      for (let pi = 1; pi < isoPoints.length - 1; pi++) {
        g.lineTo(isoPoints[pi]!.x, isoPoints[pi]!.y)
      }
      g.lineTo(endEdge.x, endEdge.y)
      g.stroke()

      // 線を描画（メイン色）
      g.setStrokeStyle({ width: 5, color, alpha: 0.8 })
      g.moveTo(startEdge.x, startEdge.y)
      for (let pi = 1; pi < isoPoints.length - 1; pi++) {
        g.lineTo(isoPoints[pi]!.x, isoPoints[pi]!.y)
      }
      g.lineTo(endEdge.x, endEdge.y)
      g.stroke()

      // 終端の矢印
      const arrowAngle = Math.atan2(endEdge.y - prevPt.y, endEdge.x - prevPt.x)
      const headLen = 16
      const p1x = endEdge.x, p1y = endEdge.y
      const p2x = endEdge.x - headLen * Math.cos(arrowAngle - Math.PI / 6)
      const p2y = endEdge.y - headLen * Math.sin(arrowAngle - Math.PI / 6)
      const p3x = endEdge.x - headLen * Math.cos(arrowAngle + Math.PI / 6)
      const p3y = endEdge.y - headLen * Math.sin(arrowAngle + Math.PI / 6)

      // 暗い縁取り
      const baseLen = Math.hypot(p3x - p2x, p3y - p2y)
      const gap = 6
      const ratio = Math.max(0, (baseLen - gap) / 2 / baseLen)
      const p2_inner_x = p2x + (p3x - p2x) * ratio
      const p2_inner_y = p2y + (p3y - p2y) * ratio
      const p3_inner_x = p3x + (p2x - p3x) * ratio
      const p3_inner_y = p3y + (p2y - p3y) * ratio

      g.setStrokeStyle({ width: 3, color: darkColor, alpha: 0.8, join: 'round' })
      g.beginPath()
      g.moveTo(p2_inner_x, p2_inner_y)
      g.lineTo(p2x, p2y)
      g.lineTo(p1x, p1y)
      g.lineTo(p3x, p3y)
      g.lineTo(p3_inner_x, p3_inner_y)
      g.stroke()

      // メイン色塗りつぶし
      g.setStrokeStyle({ width: 0 })
      g.beginPath()
      g.moveTo(p1x, p1y)
      g.lineTo(p2x, p2y)
      g.lineTo(p3x, p3y)
      g.closePath()
      g.fill({ color, alpha: 0.8 })
    } else {
      // ターゲットが拠点でない場合もA*パスで折れ線描画
      const pathPoints = gameStore.getPath(source.x, source.y, target.x, target.y, 'player')
      const isoPoints: { x: number; y: number }[] = pathPoints.map(p => toIso(p.x, p.y))

      if (isoPoints.length < 2) return

      // 始点: ソース楕円の外周から（ソースが拠点の場合）
      let fromX: number, fromY: number
      if (sourceIsBase) {
        const firstNext = isoPoints[1]!
        const startAngle = Math.atan2(firstNext.y - sCy, firstNext.x - sCx)
        const startEdge = ellipseEdge(sCx, sCy, HIGHLIGHT_HW, HIGHLIGHT_HH, startAngle)
        fromX = startEdge.x
        fromY = startEdge.y
      } else {
        fromX = sPos.x
        fromY = sPos.y
      }

      // 終点: マウス位置そのまま
      const lastPt = isoPoints[isoPoints.length - 1]!
      const toX = lastPt.x
      const toY = lastPt.y

      const dist = Math.hypot(toX - fromX, toY - fromY)
      if (dist <= 0) return

      // 線を描画（暗い縁取り）
      g.setStrokeStyle({ width: 7, color: darkColor, alpha: 0.8 })
      g.moveTo(fromX, fromY)
      for (let pi = 1; pi < isoPoints.length - 1; pi++) {
        g.lineTo(isoPoints[pi]!.x, isoPoints[pi]!.y)
      }
      g.lineTo(toX, toY)
      g.stroke()

      // 線を描画（メイン色）
      g.setStrokeStyle({ width: 5, color, alpha: 0.8 })
      g.moveTo(fromX, fromY)
      for (let pi = 1; pi < isoPoints.length - 1; pi++) {
        g.lineTo(isoPoints[pi]!.x, isoPoints[pi]!.y)
      }
      g.lineTo(toX, toY)
      g.stroke()

      // 終端の矢印
      const prevPt = isoPoints.length >= 2 ? isoPoints[isoPoints.length - 2]! : { x: fromX, y: fromY }
      const arrowAngle = Math.atan2(toY - prevPt.y, toX - prevPt.x)
      const headLen = 16
      const p1x = toX, p1y = toY
      const p2x = toX - headLen * Math.cos(arrowAngle - Math.PI / 6)
      const p2y = toY - headLen * Math.sin(arrowAngle - Math.PI / 6)
      const p3x = toX - headLen * Math.cos(arrowAngle + Math.PI / 6)
      const p3y = toY - headLen * Math.sin(arrowAngle + Math.PI / 6)

      // 暗い縁取り
      const baseLen = Math.hypot(p3x - p2x, p3y - p2y)
      const gap = 6
      const ratio = Math.max(0, (baseLen - gap) / 2 / baseLen)
      const p2_inner_x = p2x + (p3x - p2x) * ratio
      const p2_inner_y = p2y + (p3y - p2y) * ratio
      const p3_inner_x = p3x + (p2x - p3x) * ratio
      const p3_inner_y = p3y + (p2y - p3y) * ratio

      g.setStrokeStyle({ width: 3, color: darkColor, alpha: 0.8, join: 'round' })
      g.beginPath()
      g.moveTo(p2_inner_x, p2_inner_y)
      g.lineTo(p2x, p2y)
      g.lineTo(p1x, p1y)
      g.lineTo(p3x, p3y)
      g.lineTo(p3_inner_x, p3_inner_y)
      g.stroke()

      // メイン色塗りつぶし
      g.setStrokeStyle({ width: 0 })
      g.beginPath()
      g.moveTo(p1x, p1y)
      g.lineTo(p2x, p2y)
      g.lineTo(p3x, p3y)
      g.closePath()
      g.fill({ color, alpha: 0.8 })
    }
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

    // 背景クリックでユニット選択解除
    app.stage.on('pointerdown', () => {
      selectedUnitId.value = null
    })
  }

  window.addEventListener('pointerup', handleGlobalPointerUp)
  window.addEventListener('pointermove', handleGlobalPointerMove)
})

const handleGlobalPointerMove = (e: PointerEvent) => {
  if (longPressTimeout) {
    const distMoved = Math.hypot(e.clientX - pointerDownPos.value.x, e.clientY - pointerDownPos.value.y)
    if (distMoved > 10) {
      clearTimeout(longPressTimeout)
      longPressTimeout = null
    }
  }
}

const openContextMenuFunc = async (type: 'base' | 'unit', targetId: string, clickX: number, clickY: number) => {
    contextMenu.value = {
      visible: true,
      x: clickX,
      y: clickY,
      type,
      targetId
    }
    
    await nextTick()
    if (contextMenuRef.value) {
       const rect = contextMenuRef.value.getBoundingClientRect()
       const viewportWidth = window.innerWidth
       const viewportHeight = window.innerHeight

       let newX = clickX
       let newY = clickY

       if (newX + rect.width > viewportWidth - 10) {
           newX = viewportWidth - rect.width - 10
       }
       if (newY + rect.height > viewportHeight - 10) {
           newY = viewportHeight - rect.height - 10
       }
       
       contextMenu.value.x = newX
       contextMenu.value.y = newY
    }

    gameStore.pauseGame()
    draggingFromBaseId.value = null
    pointerDownEntityId.value = null
    menuJustOpened.value = true
}

const handleGlobalPointerUp = async (e: PointerEvent) => {
  if (longPressTimeout) {
    clearTimeout(longPressTimeout)
    longPressTimeout = null
  }

  const logicalMouse = fromIso(mousePos.value.x, mousePos.value.y)
  const distMoved = Math.hypot(e.clientX - pointerDownPos.value.x, e.clientY - pointerDownPos.value.y)
  const isClick = distMoved < 10

  if (isClick && pointerDownEntityId.value) {
    // Normal single short click on a base/unit.
    // Menus now trigger on long-press instead, so short-clicks do nothing but end dragging.
    draggingFromBaseId.value = null
    pointerDownEntityId.value = null
    return // Stop further drag processing
  }
  
  // Clear tracker
  pointerDownEntityId.value = null

  if (menuJustOpened.value) {
     menuJustOpened.value = false
     return
  }

  // Close context menu if clicking anywhere else
  if (contextMenu.value.visible) {
     // Check if click was inside the context menu
     const isInsideMenu = contextMenuRef.value?.contains(e.target as Node)
     if (!isInsideMenu) {
        closeContextMenu()
     }
  }

  if (multiSendTargetId.value) {
    const targetId = multiSendTargetId.value
    gameStore.bases.forEach(base => {
      if (base.owner === 'player' && base.id !== targetId) {
        gameStore.sendUnits(base.id, targetId)
      }
    })
    multiSendTargetId.value = null
  } else if (draggingFromBaseId.value && !draggingFromBaseId.value.startsWith('unit:')) {
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
  } else if (draggingFromBaseId.value?.startsWith('unit:')) {
    draggingFromBaseId.value = null
  }
}

const handleContextMenuAction = (action: string) => {
  if (action === 'upgrade' && contextMenu.value.type === 'base' && contextMenu.value.targetId) {
    const success = gameStore.upgradeBase(contextMenu.value.targetId)
    if (success) {
      const base = gameStore.bases.find(b => b.id === contextMenu.value.targetId)
      if (base) {
        const pos = toIso(base.x, base.y)
        createFloatingText('RANK UP!', pos.x, pos.y - 60, 0x2ecc71)
      }
    }
  } else if (action === 'stop' && contextMenu.value.type === 'unit' && contextMenu.value.targetId) {
    gameStore.stopUnit(contextMenu.value.targetId)
  }
  closeContextMenu()
}

const closeContextMenu = () => {
  contextMenu.value.visible = false
  contextMenu.value.targetId = null
  contextMenu.value.type = null
  gameStore.resumeGame()
}

onUnmounted(() => {
  window.removeEventListener('pointerup', handleGlobalPointerUp)
  window.removeEventListener('pointermove', handleGlobalPointerMove)
  if (app) {
    app.destroy(true, { children: true, texture: true })
  }
})
</script>

<template>
  <div class="game-container" @contextmenu.prevent>
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
    
    <!-- Context Menu Overlay -->
    <div 
      v-if="contextMenu.visible"
      ref="contextMenuRef"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
    >
      <div class="context-menu-content">
        <template v-if="contextMenu.type === 'base'">
          <button 
            class="context-menu-item" 
            :class="{ disabled: !canUpgradeTargetBase }"
            :disabled="!canUpgradeTargetBase"
            @click="handleContextMenuAction('upgrade')"
          >
            <span>アップグレード ({{ upgradeCost }})</span>
          </button>
        </template>
        
        <template v-if="contextMenu.type === 'unit'">
          <button class="context-menu-item" @click="handleContextMenuAction('stop')">
            <span>停止 (ポイント回収)</span>
          </button>
        </template>
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

/* Context Menu Styles */
.context-menu {
  position: fixed;
  z-index: 1000;
  background-color: #1a1b1e;
  border: 1px solid #3a3b3e;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  min-width: 200px;
  padding: 6px 0;
  color: #e4e5e7;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  user-select: none;
}

.context-menu-content {
  display: flex;
  flex-direction: column;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 16px;
  background: none;
  border: none;
  color: #e4e5e7;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
  margin: 0;
  transition: background-color 0.1s ease;
  border-radius: 0;
}

.context-menu-item:not(.disabled):hover {
  background-color: #313236;
  color: #ffffff;
}

.context-menu-item.disabled {
  color: #555;
  cursor: not-allowed;
}
</style>
