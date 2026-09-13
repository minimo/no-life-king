import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { createTerritory, createPathOverlay } from './overlays'
import { FACTION } from './models'
import type { Base } from '../../types/game'

describe('territory and path overlays', () => {
    it('fills the territory interior with translucent faction color and follows terrain height', () => {
        const height = (x: number, y: number) => x * .15 + y * .2
        const zone = createTerritory(height)
        const base = { x: 200, y: 300, currentZoneRadius: 100, owner: 'player' } as Base
        zone.update(base)
        const fill = zone.group.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
        expect(fill.material.color.getHex()).toBe(FACTION.player)
        expect(fill.material.transparent).toBe(true)
        expect(fill.material.opacity).toBeGreaterThan(0)
        expect(fill.material.opacity).toBeLessThan(1)
        expect(fill.material.depthWrite).toBe(false)
        expect(fill.geometry.index!.count).toBeGreaterThan(1000)
        const positions = fill.geometry.getAttribute('position')
        let interiorVertices = 0
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i), z = positions.getZ(i)
            expect(positions.getY(i)).toBeCloseTo(height(x, z) + 1.2, 4)
            if (Math.hypot(x - base.x, z - base.y) < 50) interiorVertices++
        }
        expect(interiorVertices).toBeGreaterThan(100)
        zone.update({ ...base, owner: 'cpu', currentZoneRadius: 150 })
        expect(fill.material.color.getHex()).toBe(FACTION.cpu)
        expect(fill.geometry.getAttribute('position').getX(1 + 23 * 96)).toBeCloseTo(350)
        zone.update({ ...base, owner: 'neutral' })
        expect(zone.group.visible).toBe(false)
        zone.destroy()
    })

    it('draws a faction-colored thick path and a solid arrowhead with stable screen size', () => {
        const camera = new THREE.PerspectiveCamera(40, 800 / 600, 1, 3000)
        camera.position.set(100, 180, 200); camera.lookAt(50, 0, 0); camera.updateMatrixWorld()
        const canvas = { clientWidth: 800, clientHeight: 600 } as HTMLElement
        const overlay = createPathOverlay(camera, canvas, () => 0)
        overlay.add([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }])
        const line = overlay.group.children[0] as Line2
        const head = overlay.group.children[1] as THREE.Mesh
        expect(line).toBeInstanceOf(Line2)
        expect((line.material as LineMaterial).linewidth).toBe(6)
        expect(line.material.color.getHex()).toBe(FACTION.player)
        expect(head.geometry.getAttribute('position').count).toBe(3)
        for (const zoom of [1, 2]) {
            camera.zoom = zoom; camera.updateProjectionMatrix()
            overlay.updateCamera()
            const p = head.geometry.getAttribute('position')
            const a = new THREE.Vector3().fromBufferAttribute(p, 1).project(camera)
            const b = new THREE.Vector3().fromBufferAttribute(p, 2).project(camera)
            expect(Math.hypot((a.x - b.x) * 400, (a.y - b.y) * 300)).toBeCloseTo(20, 3)
        }
        overlay.clear()
        overlay.add([{ x: 5, y: 5 }, { x: 5, y: 5 }])
        expect(overlay.group.children).toHaveLength(0)
        overlay.destroy()
    })
})
