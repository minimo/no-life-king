import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { generateMap } from '../../game/mapGenerator'
import { createMulberry32, hashString } from '../../game/random'
import { createHeightfield, MAP_MIN, MAP_MAX, MESH_STEP } from './heightfield'
import { createLandscape } from './landscape'
import { createTerrainMeshes } from './terrainMesh'

const fixture = () => {
    const { mapGrid, bases } = generateMap(createMulberry32(hashString('123456')))
    const field = createHeightfield(mapGrid, bases)
    return { mapGrid, bases, field, landscape: createLandscape(mapGrid, field) }
}

describe('continuous landscape', () => {
    it('joins all four battlefield edges continuously and has varying terrain beyond them', () => {
        const { field, landscape } = fixture()
        for (const t of [40, 200, 400, 600, 800]) for (const [x, y, dx, dy] of [[MAP_MIN, t, -1, 0], [MAP_MAX, t, 1, 0], [t, MAP_MIN, 0, -1], [t, MAP_MAX, 0, 1]]) {
            expect(landscape.heightAt(x!, y!)).toBeCloseTo(field.heightAt(x!, y!), 5)
            expect(landscape.heightAt(x! + dx! * .01, y! + dy! * .01)).toBeCloseTo(field.heightAt(x!, y!), 3)
        }
        const heights = Array.from({ length: 20 }, (_, i) => landscape.heightAt(-400 - i * 70, 400))
        expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(100)
    })

    it('shares the exact edge vertices and normals without adding a slab or vertical skirt', () => {
        const { field, landscape } = fixture()
        const material = new THREE.MeshBasicMaterial()
        const meshes = createTerrainMeshes(field, landscape, material)
        const central = meshes.terrain.geometry.getAttribute('position'), outer = meshes.surroundings.geometry.getAttribute('position')
        const centralNormal = meshes.terrain.geometry.getAttribute('normal'), outerNormal = meshes.surroundings.geometry.getAttribute('normal')
        for (let i = 0; i < field.size - 1; i += 10) {
            expect(outer.getX(i)).toBeCloseTo(MAP_MIN + i * MESH_STEP, 5)
            expect(outer.getY(i)).toBeCloseTo(central.getY(i), 5)
            expect(outer.getZ(i)).toBeCloseTo(central.getZ(i), 5)
            expect(outerNormal.getY(i)).toBeCloseTo(centralNormal.getY(i), 5)
        }
        expect(meshes.surroundings.geometry.getAttribute('position').count).toBeLessThan(100000)
        // Test both triangle halves around all four sides and across near/far rings.
        const indices = meshes.surroundings.geometry.getIndex()!
        for (let i = 0; i < indices.count; i += 111) {
            const vertices = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)]
            const x = vertices.reduce((sum, v) => sum + outer.getX(v), 0) / 3
            const y = vertices.reduce((sum, v) => sum + outer.getZ(v), 0) / 3
            const h = vertices.reduce((sum, v) => sum + outer.getY(v), 0) / 3
            expect(meshes.heightAt(x, y)).toBeCloseTo(h, 3)
        }
        meshes.destroy(); material.dispose()
    })

    it('extends a river beyond the former map boundary and leaves game data untouched', () => {
        const { mapGrid, bases, field, landscape } = fixture()
        const before = JSON.stringify({ mapGrid, bases })
        for (const x of [-1000, -10, 300, 1200]) expect(Number.isFinite(landscape.surfaceAt(x, 400))).toBe(true)
        expect(JSON.stringify({ mapGrid, bases })).toBe(before)
        const riverColumn = mapGrid[0]!.findIndex(tile => tile === 1)
        expect(riverColumn).toBeGreaterThanOrEqual(0)
        expect(landscape.heightAt(riverColumn * 16, MAP_MIN - 4)).toBeLessThan(0)
        expect(landscape.surfaceAt(riverColumn * 16, MAP_MIN - 4)).toBe(0)
        expect(landscape.heightAt(416, 416)).toBe(field.heightAt(416, 416))
    })
})
