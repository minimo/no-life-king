import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Base, Unit } from '../../types/game'
import { createSurfaceMaterials } from './materials'

export const FACTION = { player: 0xbd97ef, cpu: 0xef9488, neutral: 0xf1e4be }

export function createModelKit() {
    const box = new THREE.BoxGeometry(1, 1, 1)
    const rounded = new RoundedBoxGeometry(1, 1, 1, 3, .09)
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24)
    const cone = new THREE.ConeGeometry(1, 1, 32)
    const sphere = new THREE.SphereGeometry(1, 20, 14)
    const surfaces = createSurfaceMaterials()
    const geometries = new Set<THREE.BufferGeometry>([box, rounded, cylinder, cone, sphere])
    const materials = new Map<number, THREE.MeshStandardMaterial>()
    const metalMaterials = new Map<number, THREE.MeshStandardMaterial>()
    const clothMaterials = new Map<number, THREE.MeshStandardMaterial>()
    const material = (color: number) => {
        if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .82 }))
        return materials.get(color)!
    }
    const metal = (color: number) => {
        if (!metalMaterials.has(color)) metalMaterials.set(color, surfaces.metal(color))
        return metalMaterials.get(color)!
    }
    const cloth = (color: number) => {
        if (!clothMaterials.has(color)) clothMaterials.set(color, surfaces.cloth(color))
        return clothMaterials.get(color)!
    }
    const part = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: number | THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
        const mesh = new THREE.Mesh(geometry, typeof color === 'number' ? material(color) : color)
        mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz)
        mesh.castShadow = mesh.receiveShadow = true
        parent.add(mesh)
        return mesh
    }
    // Merge static detail by material; hundreds of stones remain only a few draw calls.
    const bake = (group: THREE.Group) => {
        const batches = new Map<THREE.Material, THREE.BufferGeometry[]>()
        for (const child of [...group.children]) {
            if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue
            child.updateMatrix()
            let g = child.geometry.clone().applyMatrix4(child.matrix)
            if (g.index) { const indexed = g; g = g.toNonIndexed(); indexed.dispose() }
            if (!batches.has(child.material)) batches.set(child.material, [])
            batches.get(child.material)!.push(g)
            group.remove(child)
        }
        batches.forEach((parts, mat) => {
            const geometry = mergeGeometries(parts)!
            geometries.add(geometry)
            parts.forEach(g => g.dispose())
            part(group, geometry, mat, 0, 0, 0, 1, 1, 1)
        })
    }
    const curveCloth = (width: number, height: number) => {
        const geometry = new THREE.PlaneGeometry(width, height, 12, 12)
        const position = geometry.getAttribute('position')
        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i), y = position.getY(i)
            position.setZ(i, Math.sin(x * 2.4) * .18 + Math.sin(y * .9 + x) * .18)
        }
        geometry.computeVertexNormals(); geometries.add(geometry)
        return geometry
    }
    const fortCache = new Map<string, THREE.Group>()
    const fort = (base: Base) => {
        const key = `${base.owner}:${base.rank}:${base.isCore}`
        const large = base.isCore || base.rank === 3
        const labelHeight = large ? 61 : base.rank === 2 ? 49 : 39
        if (fortCache.has(key)) {
            const group = fortCache.get(key)!.clone(true)
            return { group, flag: group.getObjectByName('banner')!, labelHeight }
        }
        const group = new THREE.Group()
        const stone = surfaces.stone, trim = material(0xafa995), dark = material(0x33383a)
        const width = large ? 29 : base.rank === 2 ? 24 : 19
        part(group, rounded, stone, 0, 1, 0, width + 7, 2, width + 7)
        // Four enclosing walls with a working-depth courtyard and an arched gate.
        for (const side of [-1, 1]) {
            part(group, box, stone, side * (width / 2 - 1.4), 9, 0, 2.8, 16, width)
            part(group, box, stone, 0, 9, -width / 2 + 1.4, width, 16, 2.8)
            part(group, box, stone, side * (width / 4 + 2), 9, width / 2 - 1.4, width / 2 - 4, 16, 2.8)
        }
        part(group, box, stone, 0, 14, width / 2 - 1.4, 8, 6, 2.8)
        part(group, rounded, surfaces.wood, 0, 5, width / 2 - 1, 6.5, 8, .7)
        for (let i = -3; i <= 3; i++) part(group, cylinder, metal(0x434747), i, 5, width / 2 - .5, .09, 9, .09)
        for (let a = 0; a <= 10; a++) {
            const angle = a / 10 * Math.PI
            const voussoir = part(group, rounded, trim, Math.cos(angle) * 4, 8 + Math.sin(angle) * 4, width / 2, 1.15, 1.8, 1.4)
            voussoir.rotation.z = angle - Math.PI / 2
        }
        // Individual coping stones and recessed masonry courses.
        for (let i = 0; i < Math.round(width / 3); i++) for (const side of [-1, 1]) {
            const p = -width / 2 + 1.5 + i * 3
            part(group, rounded, trim, p, 18.2, side * (width / 2 - 1), 1.8, 3.2, 2.2)
            part(group, rounded, trim, side * (width / 2 - 1), 18.2, p, 2.2, 3.2, 1.8)
        }
        for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) {
            const x = -width / 2 + 2 + (col + (row % 2) * .4) * (width - 4) / 7
            if (Math.abs(x) > 4 || row > 3) part(group, rounded, stone, x, 2.8 + row * 2.8, width / 2 + .03, (width - 5) / 7, 2.55, .35)
        }
        if (base.rank >= 2 || base.isCore) for (const x of [-1, 1]) for (const z of [-1, 1]) {
            const tx = x * width / 2, tz = z * width / 2
            part(group, cylinder, stone, tx, 13, tz, 4.2, 25, 4.2)
            for (const y of [2, 12, 24]) part(group, cylinder, trim, tx, y, tz, 4.5, .8, 4.5)
            for (let i = 0; i < 10; i++) {
                const a = i / 10 * Math.PI * 2
                const merlon = part(group, rounded, trim, tx + Math.cos(a) * 3.8, 26.5, tz + Math.sin(a) * 3.8, 1.9, 3.2, 1.7)
                merlon.rotation.y = -a
            }
            for (const y of [9, 18]) part(group, rounded, dark, tx, y, tz + 4.15, .8, 3.6, .18)
        }
        const keepY = large ? 21 : 12
        part(group, rounded, stone, 0, keepY, -2, large ? 12 : 9, large ? 32 : 17, 11)
        // Steep slate roof, chimney, recessed windows, and timber door.
        const roof = part(group, cone, metal(0x4d5c64), 0, large ? 42 : 25, -2, large ? 10 : 8, 13, large ? 10 : 8)
        roof.rotation.y = Math.PI / 4
        for (const y of large ? [14, 23, 32] : [13, 19]) for (const x of [-3, 3]) {
            part(group, rounded, trim, x, y, 3.65, 2.5, 4, .5)
            part(group, rounded, dark, x, y, 3.95, 1.6, 3.1, .15)
        }
        bake(group)
        const flagY = labelHeight - 8
        part(group, cylinder, metal(0xafa993), 0, flagY - 3, -2, .23, 16, .23)
        const flag = part(group, curveCloth(6, 4), cloth(FACTION[base.owner]), 3, flagY, -2, 1, 1, 1)
        flag.name = 'banner'
        fortCache.set(key, group)
        const instance = group.clone(true)
        return { group: instance, flag: instance.getObjectByName('banner')!, labelHeight }
    }
    const soldierCache = new Map<string, THREE.Group>()
    const soldier = (unit: Unit) => {
        const key = `${unit.owner}:${unit.rank}`
        const unpack = (group: THREE.Group) => ({ group, body: group.getObjectByName('body')!, legs: [group.getObjectByName('leftLeg')!, group.getObjectByName('rightLeg')!], sword: group.getObjectByName('sword')! })
        if (soldierCache.has(key)) return unpack(soldierCache.get(key)!.clone(true))
        const group = new THREE.Group(), body = new THREE.Group()
        body.name = 'body'; group.add(body)
        const armor = metal(unit.rank === 3 ? 0xb39a52 : unit.rank === 2 ? 0x8e5350 : 0x8d999e)
        const isHuman = unit.owner === 'player'
        const bone = material(isHuman ? 0xc69b7c : 0xcac3a8)
        const leather = surfaces.wood, steel = metal(0xb9c3c8), black = material(0x24272a)
        const uniform = cloth(FACTION[unit.owner])
        // Adult proportions: narrow head, shaped cuirass, articulated limbs.
        part(body, sphere, armor, 0, 10.5, 0, 2.35, 3, 1.35)
        part(body, rounded, leather, 0, 8.1, 0, 4.4, .65, 2.7)
        part(body, rounded, steel, 0, 8.1, 1.4, .7, .75, .15)
        part(body, cylinder, bone, 0, 13.6, 0, .55, 1.3, .55)
        part(body, sphere, bone, 0, 15.1, .12, 1.28, 1.65, 1.2)
        part(body, rounded, bone, 0, 14.2, .7, 1.65, .7, 1.15)
        if (isHuman) {
            // Human face: skin, small eyes and a nose, without exposed skull teeth.
            for (const x of [-.5, .5]) {
                part(body, sphere, 0xeee4d9, x, 15.25, 1.2, .22, .14, .08)
                part(body, sphere, 0x384b58, x, 15.25, 1.28, .085, .095, .04)
                part(body, rounded, 0x503d31, x, 15.55, 1.17, .45, .12, .13)
            }
            part(body, sphere, bone, 0, 14.9, 1.34, .24, .36, .3)
            part(body, rounded, 0x85584b, 0, 14.25, 1.29, .7, .12, .12)
            part(body, sphere, armor, 0, 16, -.1, 1.43, 1.1, 1.32)
            for (const side of [-1, 1]) part(body, rounded, armor, side * 1.13, 14.9, .4, .35, 1.8, 1.05)
            part(body, rounded, steel, 0, 15.35, 1.3, .22, 1.8, .3)
        } else {
            // Enemy undead: bare skull, deep sockets, glowing eyes and visible teeth.
            const eyes = material(0xef5435)
            eyes.emissive.set(0xd9381f); eyes.emissiveIntensity = .8
            for (const x of [-.52, .52]) {
                part(body, sphere, black, x, 15.3, 1.16, .36, .42, .14)
                part(body, sphere, eyes, x, 15.3, 1.29, .13, .13, .05)
            }
            part(body, sphere, black, 0, 14.7, 1.34, .16, .23, .1)
            for (let x = -.6; x <= .6; x += .24) part(body, rounded, bone, x, 13.9, 1.24, .16, .3, .16)
            const rib = new THREE.TorusGeometry(1, .1, 6, 18, Math.PI * 1.65)
            geometries.add(rib)
            for (const y of [9.3, 10.1, 10.9, 11.7]) part(body, rib, bone, 0, y, 1.2, 1.7, .35, .75)
            part(body, cylinder, bone, 0, 10.6, 1.5, .18, 3.5, .18)
        }
        // Layered pauldrons, small rivets and cloth folds.
        for (const side of [-1, 1]) {
            for (let i = 0; i < 3; i++) part(body, sphere, armor, side * (2.05 + i * .23), 12.3 - i * .35, 0, 1.1, .65, 1.4)
            for (let y = 9; y <= 12; y += 1.4) part(body, sphere, steel, side * 1.5, y, 1.12, .11, .11, .11)
        }
        const cape = part(body, curveCloth(4.7, 7), uniform, 0, 9.1, -1.65, 1, 1, 1)
        cape.rotation.x = -.16
        bake(body)
        for (const [index, sign] of [-1, 1].entries()) {
            const leg = new THREE.Group(); leg.name = index === 0 ? 'leftLeg' : 'rightLeg'
            leg.position.set(sign * 1.12, 7.8, 0); body.add(leg)
            part(leg, cylinder, leather, 0, -1.7, 0, .7, 3.5, .75)
            part(leg, sphere, armor, 0, -3.4, .3, .85, .8, .8)
            part(leg, cylinder, armor, 0, -5.1, 0, .63, 3.1, .7)
            part(leg, rounded, black, 0, -7.05, .55, 1.5, 1.1, 2.6)
            bake(leg)
        }
        const sword = new THREE.Group(); sword.name = 'sword'; sword.position.set(2.65, 12, 0); body.add(sword)
        part(sword, cylinder, armor, .25, -1.4, 0, .55, 2.6, .55)
        part(sword, sphere, bone, .4, -2.8, .3, .55, .55, .55)
        part(sword, cylinder, armor, .4, -3.7, 1, .5, 2.1, .5).rotation.x = -.55
        part(sword, sphere, bone, .4, -4.5, 1.5, .6, .65, .6)
        part(sword, rounded, leather, .4, -3.7, 2, .45, 2, .45)
        part(sword, rounded, steel, .4, -2.4, 2, 2.8, .35, .55)
        part(sword, rounded, steel, .4, 1.5, 2, .85, 7.5, .22)
        part(sword, cone, steel, .4, 5.7, 2, .43, 1.3, .12)
        bake(sword)
        part(body, cylinder, armor, -2.9, 10.1, .2, .6, 3, .6)
        const shield = part(body, sphere, steel, -3.2, 8.2, 1.3, 2, 2.7, .38)
        part(body, sphere, uniform, shield.position.x, shield.position.y, 1.62, 1.77, 2.45, .17)
        part(body, sphere, steel, shield.position.x, shield.position.y, 1.83, .6, .6, .28)
        group.scale.setScalar(1 + (unit.rank - 1) * .09)
        soldierCache.set(key, group)
        return unpack(group.clone(true))
    }
    return { box, rounded, cone, cylinder, sphere, surfaces, material, part, fort, soldier, destroy() {
        geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); surfaces.destroy()
        fortCache.clear(); soldierCache.clear()
    } }
}
export type ModelKit = ReturnType<typeof createModelKit>
