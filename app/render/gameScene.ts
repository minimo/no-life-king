import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { getNightAlpha } from '~/game/daynight'
import type { useGameStore } from '~/stores/game'
import type { GameInput } from '~/composables/useGameInput'
import type { Base, Unit } from '~/types/game'
import { createModelKit, FACTION } from './three/models'
import { createWorld } from './three/world'
import { createPathOverlay, createTerritory } from './three/overlays'

interface GameSceneOptions {
    canvasEl: HTMLElement
    gameStore: ReturnType<typeof useGameStore>
    input: GameInput
}

export async function createGameScene({ canvasEl, gameStore, input }: GameSceneOptions) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.setAttribute('aria-label', '3Dの戦場。拠点をドラッグして出兵、長押しでメニュー。何もない場所からの左ドラッグでパン、Shiftと右ドラッグで回転、ホイールで拡大縮小。')
    canvasEl.appendChild(renderer.domElement)
    const labels = document.createElement('div')
    labels.className = 'world-labels'
    canvasEl.appendChild(labels)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x16282c)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const environmentScene = new RoomEnvironment()
    const environment = pmrem.fromScene(environmentScene, .04)
    scene.environment = environment.texture
    scene.environmentIntensity = .45
    environmentScene.dispose()
    pmrem.dispose()
    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 1, 12000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = true
    controls.screenSpacePanning = false
    controls.panSpeed = 1.15
    controls.minDistance = 220
    controls.maxDistance = 2300
    controls.minPolarAngle = .25
    controls.maxPolarAngle = Math.PI / 2.6
    controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }
    controls.touches = { ONE: null as unknown as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_PAN }
    const resetCamera = () => {
        controls.enableDamping = false
        controls.update() // Flush any rotation momentum before restoring the view.
        controls.target.set(416, 8, 416)
        const fit = Math.max(1, 1.15 / camera.aspect)
        camera.position.set(416 + 944 * fit, 8 + 1195 * fit, 416 + 944 * fit)
        controls.maxDistance = Math.max(2300, 2600 * fit)
        camera.zoom = 1
        camera.updateProjectionMatrix()
        controls.update()
        controls.enableDamping = true
    }
    resetCamera()
    const sky = new THREE.HemisphereLight(0xc8e5e4, 0x56634d, 2.2)
    const sun = new THREE.DirectionalLight(0xffdeb3, 3)
    sun.position.set(200, 750, 200)
    sun.target.position.set(416, 0, 416)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -650, right: 650, top: 650, bottom: -650, near: 1, far: 1800 })
    sun.shadow.bias = -.0004
    sun.shadow.normalBias = 1.5
    scene.add(sky, sun, sun.target)
    const kit = createModelKit()
    gameStore.initGame()
    let world = createWorld(gameStore.mapGrid, gameStore.bases, kit)
    let mapReference = gameStore.mapGrid
    scene.add(world.group)

    const makeLabel = (kind: 'base' | 'unit', id: string) => {
        const label = document.createElement('button')
        label.type = 'button'
        label.className = `world-label ${kind}-label`
        label.dataset[kind] = id
        labels.appendChild(label)
        return label
    }
    const bases = new Map<string, { model: ReturnType<typeof kit.fort>; label: HTMLButtonElement; signature: string; zone: ReturnType<typeof createTerritory> }>()
    const units = new Map<string, { model: ReturnType<typeof kit.soldier>; label: HTMLButtonElement; signature: string }>()
    const removeBases = () => {
        bases.forEach(v => { v.model.group.removeFromParent(); v.label.remove(); v.zone.destroy() })
        bases.clear()
    }
    const removeUnits = () => {
        units.forEach(v => { v.model.group.removeFromParent(); v.label.remove() })
        units.clear()
    }
    const project = (x: number, y: number, elevation = 0) => {
        const point = new THREE.Vector3(x, world.field.surfaceAt(x, y) + elevation, y).project(camera)
        return { x: (point.x + 1) * canvasEl.clientWidth / 2, y: (1 - point.y) * canvasEl.clientHeight / 2, visible: point.z > -1 && point.z < 1 && Math.abs(point.x) < 1.1 && Math.abs(point.y) < 1.1 }
    }
    input.setProjectPoint((x, y) => project(x, y, 45))
    input.setCreateFloatingText((text, x, y, color = 0x8be4ba) => {
        const element = document.createElement('span')
        element.className = 'world-floating-text'
        element.textContent = text
        element.style.cssText = `left:${x}px;top:${y}px;color:#${color.toString(16).padStart(6, '0')}`
        labels.appendChild(element)
        element.addEventListener('animationend', () => element.remove(), { once: true })
    })
    const placeLabel = (label: HTMLElement, x: number, y: number, h: number) => {
        const p = project(x, y, h)
        label.style.transform = `translate(-50%, -100%) translate(${p.x}px, ${p.y}px)`
        label.hidden = !p.visible
    }
    const updateBase = (base: Base, time: number) => {
        const signature = `${base.owner}:${base.rank}:${base.isCore}`
        let visual = bases.get(base.id)
        if (!visual) {
            const model = kit.fort(base)
            const zone = createTerritory((x, y) => world.field.surfaceAt(x, y))
            visual = { model, label: makeLabel('base', base.id), signature, zone }
            bases.set(base.id, visual)
            scene.add(model.group, zone.group)
        } else if (visual.signature !== signature) {
            visual.model.group.removeFromParent()
            visual.model = kit.fort(base)
            visual.signature = signature
            scene.add(visual.model.group)
        }
        visual.model.group.userData = { baseId: base.id }
        visual.model.group.position.set(base.x, world.field.surfaceAt(base.x, base.y), base.y)
        visual.model.flag.rotation.y = Math.sin(time * 2 + base.x) * .15
        const color = `#${FACTION[base.owner].toString(16)}`
        visual.label.style.setProperty('--faction', color)
        visual.label.classList.toggle('is-target', input.isTargetBase(base))
        visual.label.classList.toggle('is-source', input.isSourceBase(base))
        const labelText = String(Math.floor(base.production))
        if (visual.label.textContent !== labelText) visual.label.textContent = labelText
        visual.label.setAttribute('aria-label', `${base.owner === 'player' ? '自軍' : base.owner === 'cpu' ? '敵軍' : '中立'}拠点 兵力${labelText}`)
        placeLabel(visual.label, base.x, base.y, visual.model.labelHeight)
        visual.zone.update(base)
    }
    const updateUnit = (unit: Unit, time: number) => {
        const signature = `${unit.owner}:${unit.rank}`
        let visual = units.get(unit.id)
        if (visual && visual.signature !== signature) {
            visual.model.group.removeFromParent(); visual.label.remove(); units.delete(unit.id); visual = undefined
        }
        if (!visual) {
            visual = { model: kit.soldier(unit), label: makeLabel('unit', unit.id), signature }
            units.set(unit.id, visual)
            scene.add(visual.model.group)
        }
        const { model, label } = visual
        model.group.userData = { unitId: unit.id }
        model.group.position.set(unit.x, world.field.surfaceAt(unit.x, unit.y) + .8, unit.y)
        const target = unit.path[unit.pathIndex + 1] ?? gameStore.bases.find(b => b.id === unit.targetId)
        if (target && !unit.isStopped) model.group.rotation.y = Math.atan2(target.x - unit.x, target.y - unit.y)
        const moving = !unit.isStopped && !unit.isFighting
        const stride = moving ? Math.sin(time * 10 + unit.elapsedTime) * .6 : 0
        model.legs[0]!.rotation.x = stride
        model.legs[1]!.rotation.x = -stride
        model.body.position.y = moving ? Math.abs(stride) * .7 : 0
        model.sword.rotation.x = unit.isFighting ? Math.sin(time * 16) * 1.2 : -.15
        label.style.setProperty('--faction', `#${FACTION[unit.owner].toString(16)}`)
        label.classList.toggle('is-target', input.selectedUnitId.value === unit.id)
        const text = String(Math.ceil(unit.power))
        if (label.textContent !== text) label.textContent = text
        label.setAttribute('aria-label', `${unit.owner === 'player' ? '自軍' : '敵軍'}ユニット 兵力${Math.ceil(unit.power)}`)
        placeLabel(label, unit.x, unit.y, 24 + unit.rank * 2)
    }

    const pathOverlay = createPathOverlay(camera, canvasEl, (x, y) => world.field.surfaceAt(x, y))
    const paths = pathOverlay.group
    scene.add(paths)
    let pathKey = ''
    const clearPaths = pathOverlay.clear
    const addPath = pathOverlay.add
    const updatePaths = () => {
        const selected = gameStore.units.find(u => u.id === input.selectedUnitId.value)
        if (input.selectedUnitId.value && !selected) input.clearSelection()
        const key = [input.draggingFromBaseId.value, input.targetedBaseId.value, input.multiSendTargetId.value, input.selectedUnitId.value,
            Math.round(input.worldMousePos.value.x / 4), Math.round(input.worldMousePos.value.y / 4),
            selected ? `${selected.pathIndex}:${Math.round(selected.x)}:${Math.round(selected.y)}:${selected.targetId}:${selected.isStopped}` : '',
            Math.floor(animationTime * 5)].join('|')
        if (key === pathKey) return
        pathKey = key
        clearPaths()
        const targetId = input.multiSendTargetId.value || input.targetedBaseId.value
        const target = gameStore.bases.find(b => b.id === targetId)
        const sourceId = input.draggingFromBaseId.value
        const source = sourceId?.startsWith('unit:') ? gameStore.units.find(u => u.id === sourceId.slice(5)) : gameStore.bases.find(b => b.id === sourceId)
        const sources = input.multiSendTargetId.value ? gameStore.bases.filter(b => b.owner === 'player' && b.id !== targetId) : source ? [source] : []
        for (const from of sources) {
            if (target && target.id !== from.id) addPath([{ x: from.x, y: from.y }, ...gameStore.getPath(from.x, from.y, target.x, target.y, from.rank)])
            else if (!target) addPath([from, input.worldMousePos.value])
        }
        if (selected && !selected.isStopped) addPath([{ x: selected.x, y: selected.y }, ...selected.path.slice(selected.pathIndex + 1)], selected.owner)
    }

    const raycaster = new THREE.Raycaster()
    let activePointer: number | null = null
    let panGesture = false
    const setPrimaryPan = (enabled: boolean) => {
        controls.mouseButtons.LEFT = enabled ? THREE.MOUSE.PAN : null as unknown as THREE.MOUSE
        controls.touches.ONE = enabled ? THREE.TOUCH.PAN : null as unknown as THREE.TOUCH
    }
    const endGesture = () => {
        activePointer = null
        panGesture = false
        setPrimaryPan(false)
        renderer.domElement.style.cursor = 'default'
    }
    const pointer = (event: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect()
        camera.updateMatrixWorld()
        scene.updateMatrixWorld(true)
        raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera)
        const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-base], [data-unit]') : null
        let baseId = element?.dataset.base, unitId = element?.dataset.unit
        if (!baseId && !unitId) {
            const hit = raycaster.intersectObjects([...bases.values()].map(v => v.model.group).concat([...units.values()].map(v => v.model.group)), true)[0]
            let object = hit?.object
            while (object) {
                if (object.userData.baseId) { baseId = object.userData.baseId; break }
                if (object.userData.unitId) { unitId = object.userData.unitId; break }
                object = object.parent ?? undefined
            }
        }
        const base = gameStore.bases.find(b => b.id === baseId), unit = gameStore.units.find(u => u.id === unitId)
        const ground = raycaster.intersectObjects(world.pickables, true)[0]
        if (base) input.setWorldPointer(base)
        else if (ground) input.setWorldPointer({ x: ground.point.x, y: ground.point.z })
        else input.setWorldPointer({ x: -10000, y: -10000 })
        renderer.domElement.style.cursor = base || unit ? 'pointer' : 'default'
        return { base, unit }
    }
    const down = (event: PointerEvent) => {
        if (event.button !== 0 || gameStore.status !== 'playing') return
        if (activePointer !== null) { input.reset(); activePointer = null; panGesture = true; return }
        activePointer = event.pointerId
        const { base, unit } = pointer(event)
        // Decide once, before OrbitControls receives pointerdown. Crossing an entity
        // during a background drag must never turn that gesture into a game command.
        panGesture = !base && !unit
        setPrimaryPan(panGesture)
        if (base) input.handleBasePointerDown(base, event)
        else if (unit) input.handleUnitPointerDown(unit, event)
        else { input.reset(); renderer.domElement.style.cursor = 'grabbing' }
    }
    const move = (event: PointerEvent) => {
        if (gameStore.status !== 'playing') return
        if (panGesture) return
        input.handleGlobalPointerMove(event)
        if (canvasEl.contains(event.target as Node) || activePointer === event.pointerId) pointer(event)
    }
    const up = (event: PointerEvent) => {
        if (input.contextMenu.value.visible || (!panGesture && activePointer === event.pointerId)) {
            pointer(event)
            input.handleGlobalPointerUp(event)
        }
        if (activePointer === event.pointerId || activePointer === null) endGesture()
    }
    const cancel = () => { endGesture(); input.reset(); gameStore.resumeGame() }
    canvasEl.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    const resize = () => {
        const width = canvasEl.clientWidth, height = canvasEl.clientHeight
        if (!width || !height) return
        renderer.setSize(width, height)
        const previousAspect = camera.aspect
        camera.aspect = width / height
        // Reserve room for the HUD without moving the orbit focus below the ground.
        camera.setViewOffset(width, height, 0, Math.round(height * .06), width, height)
        camera.updateProjectionMatrix()
        if (Math.abs(previousAspect - camera.aspect) > .01) resetCamera()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvasEl)
    resize()
    let lastTime = 0, animationTime = 0, frame = 0, destroyed = false
    const animate = (now: number) => {
        if (destroyed) return
        const delta = lastTime ? Math.min((now - lastTime) / 1000, .1) : 0
        lastTime = now
        if (mapReference !== gameStore.mapGrid) {
            input.reset(); endGesture(); removeBases(); removeUnits(); clearPaths(); pathKey = ''
            world.destroy()
            world = createWorld(gameStore.mapGrid, gameStore.bases, kit)
            mapReference = gameStore.mapGrid
            scene.add(world.group)
            resetCamera()
        }
        controls.enabled = gameStore.status === 'playing'
        controls.update()
        const visible = gameStore.status !== 'title'
        labels.hidden = !visible
        world.group.visible = visible
        paths.visible = visible
        if (visible) {
            gameStore.update(delta)
            if (gameStore.status === 'playing') animationTime += delta
            const night = getNightAlpha(gameStore.dayTime) * 2
            sky.intensity = 1.7 - night * .9
            sun.intensity = 2.5 - night * 1.8
            sun.color.set(night > .5 ? 0xa1bbff : 0xffdeb3)
            ;(scene.background as THREE.Color).set(0x16282c).lerp(new THREE.Color(0x0b1024), night)
            world.update(animationTime)
            gameStore.bases.forEach(b => updateBase(b, animationTime))
            gameStore.units.forEach(u => updateUnit(u, animationTime))
            const alive = new Set(gameStore.units.map(u => u.id))
            units.forEach((v, id) => { if (!alive.has(id)) { v.model.group.removeFromParent(); v.label.remove(); units.delete(id) } })
            input.updateTargetedBase()
            updatePaths()
        }
        bases.forEach(v => { v.model.group.visible = visible; v.zone.group.visible = visible && gameStore.bases.find(b => b.id === v.model.group.userData.baseId)?.owner !== 'neutral' })
        units.forEach(v => { v.model.group.visible = visible })
        pathOverlay.updateCamera()
        renderer.render(scene, camera)
        frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return { resetCamera, destroy() {
        destroyed = true
        cancelAnimationFrame(frame)
        observer.disconnect()
        canvasEl.removeEventListener('pointerdown', down, true)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
        window.removeEventListener('blur', cancel)
        input.reset()
        controls.dispose()
        removeBases(); removeUnits(); pathOverlay.destroy()
        world.destroy(); kit.destroy(); sun.shadow.dispose()
        environment.dispose(); renderer.dispose(); renderer.forceContextLoss()
        renderer.domElement.remove(); labels.remove()
    } }
}
export type GameScene = Awaited<ReturnType<typeof createGameScene>>
