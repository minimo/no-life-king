import * as THREE from 'three'
import { createForest } from './forest'
import { TILE, TILE_PX } from '../../game/constants'
import type { Base } from '../../types/game'
import { BRIDGE_HEIGHT, createHeightfield, MAP_MIN, MESH_STEP } from './heightfield'
import type { ModelKit } from './models'

export function createWorld(grid: number[][], bases: Base[], kit: ModelKit) {
    grid = grid.map(row => Array.from(row))
    const group = new THREE.Group()
    const field = createHeightfield(grid, bases)
    const { size, heights } = field
    const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = []
    const color = new THREE.Color()
    const meadow = new THREE.Color(0x687552), rock = new THREE.Color(0x929080), bank = new THREE.Color(0x7d7863)
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        const x = MAP_MIN + i * MESH_STEP, z = MAP_MIN + j * MESH_STEP, h = heights[j * size + i]!
        positions.push(x, h, z)
        color.copy(meadow).lerp(rock, THREE.MathUtils.smoothstep(h, 18, 48))
        if (h < 5) color.lerp(bank, 1 - Math.max(0, h) / 5)
        color.multiplyScalar(.97 + .035 * Math.sin(x * .05) * Math.cos(z * .041))
        colors.push(color.r, color.g, color.b)
        uvs.push(i / (size - 1), j / (size - 1))
        if (i < size - 1 && j < size - 1) {
            const a = j * size + i
            indices.push(a, a + size, a + 1, a + size + 1, a + 1, a + size)
        }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    const groundMaterial = kit.surfaces.ground
    const terrain = new THREE.Mesh(geometry, groundMaterial)
    terrain.receiveShadow = true
    group.add(terrain)
    kit.part(group, kit.box, 0x303f3c, 416, -19, 416, 848, 28, 848)
    // A continuous vertical edge closes the terrain down to the diorama slab.
    const skirtPositions: number[] = []
    const edge = (a: number, b: number) => {
        const ax = MAP_MIN + a % size * MESH_STEP, az = MAP_MIN + Math.floor(a / size) * MESH_STEP
        const bx = MAP_MIN + b % size * MESH_STEP, bz = MAP_MIN + Math.floor(b / size) * MESH_STEP
        skirtPositions.push(ax, heights[a]!, az, bx, heights[b]!, bz, ax, -6, az, bx, heights[b]!, bz, bx, -6, bz, ax, -6, az)
    }
    for (let i = 0; i < size - 1; i++) {
        edge(i, i + 1); edge((size - 1) * size + i + 1, (size - 1) * size + i)
        edge((i + 1) * size, i * size); edge(i * size + size - 1, (i + 1) * size + size - 1)
    }
    const skirtGeometry = new THREE.BufferGeometry()
    skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3))
    skirtGeometry.computeVertexNormals()
    const skirt = new THREE.Mesh(skirtGeometry, kit.material(0x485747))
    group.add(skirt)

    const trees: { x: number; z: number; h: number; scale: number }[] = []
    const waterPositions: number[] = []
    const bridges: THREE.Object3D[] = []
    for (let j = 0; j < grid.length; j++) for (let i = 0; i < grid[j]!.length; i++) {
        const t = grid[j]![i]!, x = i * TILE_PX, z = j * TILE_PX
        if (t === TILE.WATER || t === TILE.BRIDGE) {
            waterPositions.push(x - 8, 0, z - 8, x - 8, 0, z + 8, x + 8, 0, z - 8, x + 8, 0, z + 8, x + 8, 0, z - 8, x - 8, 0, z + 8)
        }
        if (t === TILE.BRIDGE) {
            const bridge = new THREE.Group()
            bridge.position.set(x, 0, z)
            // Match the crossing direction used by the original map renderer.
            const riverX = grid[j]?.[i - 1] === TILE.WATER || grid[j]?.[i + 1] === TILE.WATER
            if (!riverX) bridge.rotation.y = Math.PI / 2
            kit.part(bridge, kit.rounded, kit.surfaces.wood, 0, BRIDGE_HEIGHT - 1, 0, 15, 2, 16)
            for (let k = -6; k <= 6; k += 3) kit.part(bridge, kit.rounded, kit.surfaces.wood, 0, BRIDGE_HEIGHT + .15, k, 14, .3, 2.5)
            for (const side of [-1, 1]) {
                kit.part(bridge, kit.rounded, kit.surfaces.wood, side * 7, 7, 0, .8, 1, 16)
                for (const end of [-6, 6]) kit.part(bridge, kit.rounded, kit.surfaces.wood, side * 7, 2, end, 1.2, 11, 1.2)
            }
            for (const side of [-1, 1]) for (let k = -6; k <= 6; k += 3) {
                kit.part(bridge, kit.cylinder, 0x454746, side * 5.8, BRIDGE_HEIGHT + .33, k, .14, .1, .14)
            }
            // Deck extensions form approaches at the two land-facing ends.
            for (const end of [-1, 1]) {
                const gx = riverX ? i : i + end, gy = riverX ? j + end : j
                const neighbor = grid[gy]?.[gx]
                if (neighbor !== undefined && neighbor !== TILE.BRIDGE && neighbor !== TILE.WATER) {
                    const bankHeight = field.heightAt(gx * TILE_PX, gy * TILE_PX)
                    const ramp = kit.part(bridge, kit.rounded, kit.surfaces.wood, 0, (BRIDGE_HEIGHT + bankHeight) / 2 - .5, end * 12, 14, 1, Math.hypot(8, bankHeight - BRIDGE_HEIGHT))
                    ramp.rotation.x = -end * Math.atan2(bankHeight - BRIDGE_HEIGHT, 8)
                    // Align the top face exactly with the shared walking surface.
                    ramp.position.y = (BRIDGE_HEIGHT + bankHeight) / 2 - .5 * Math.cos(ramp.rotation.x)
                    ramp.position.z = end * 12 - .5 * Math.sin(ramp.rotation.x)
                }
            }
            group.add(bridge)
            bridges.push(bridge)
        }
        if ((t === TILE.WOOD || t >= 31 && t <= 41) && !bases.some(b => Math.hypot(b.x - x, b.y - z) < 36)) {
            const count = t >= 34 ? 3 : 2
            for (let k = 0; k < count; k++) {
                const tx = x + Math.sin(i * 17 + j * 31 + k * 11) * 5
                const tz = z + Math.cos(i * 13 + j * 7 + k * 19) * 5
                trees.push({ x: tx, z: tz, h: field.heightAt(tx, tz), scale: .7 + .35 * (1 + Math.sin(i * 3 + j + k)) })
            }
        }
    }
    const forest = createForest(trees, kit)
    group.add(forest.group)
    const waterGeometry = new THREE.BufferGeometry()
    waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3))
    waterGeometry.computeVertexNormals()
    const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x466e73, roughness: .2, metalness: .45, transparent: true, opacity: .87 })
    waterMaterial.onBeforeCompile = shader => {
        shader.uniforms.time = { value: 0 }
        waterMaterial.userData.shader = shader
        shader.vertexShader = 'varying vec3 riverPosition;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nriverPosition = position;')
        shader.fragmentShader = 'uniform float time; varying vec3 riverPosition;\n' + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat ripple = sin(riverPosition.x * 1.3 + riverPosition.z * .7 - time * 1.6) * sin(riverPosition.z * 1.7 - riverPosition.x * .4 + time);\ndiffuseColor.rgb += ripple * .006;')
    }
    const water = new THREE.Mesh(waterGeometry, waterMaterial)
    group.add(water)
    return { group, field, pickables: [terrain, water, ...bridges], update(time: number) {
        const shader = waterMaterial.userData.shader
        if (shader) shader.uniforms.time.value = time
    }, destroy() {
        geometry.dispose(); skirtGeometry.dispose(); waterGeometry.dispose(); waterMaterial.dispose()
        forest.destroy()
        group.removeFromParent()
    } }
}
