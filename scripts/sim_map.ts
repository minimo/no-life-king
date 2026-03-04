import { createNoise2D } from 'simplex-noise';

class MapSim {
    mapGrid: number[][] = []
    bases: any[] = []
    
    init() {
        this.bases.push({x: 100, y: 100})
        this.bases.push({x: 600, y: 600})
        
        const noise2D_elev = createNoise2D()
        const noise2D_moist = createNoise2D()
        this.mapGrid = Array(51).fill(0).map(() => Array(51).fill(0))

        for (let y = 0; y <= 50; y++) {
            for (let x = 0; x <= 50; x++) {
                const nx = x / 50 - 0.5
                const ny = y / 50 - 0.5
                let e = noise2D_elev(nx * 3, ny * 3) + 0.5 * noise2D_elev(nx * 6, ny * 6)
                e = e / 1.5
                let m = noise2D_moist(nx * 3, ny * 3) + 0.5 * noise2D_moist(nx * 6, ny * 6)
                m = m / 1.5

                if (e > 0.45) this.mapGrid[y][x] = 2
                else if (m > 0.3) this.mapGrid[y][x] = 3
                else this.mapGrid[y][x] = 0
            }
        }

        const numRivers = 2
        for (let r = 0; r < numRivers; r++) {
            const isHorizontal = Math.random() < 0.5
            let startX: number, startY: number, endX: number, endY: number

            if (isHorizontal) {
                startX = 0; startY = Math.floor(Math.random() * 40) + 5
                endX = 50; endY = Math.floor(Math.random() * 40) + 5
            } else {
                startX = Math.floor(Math.random() * 40) + 5; startY = 0
                endX = Math.floor(Math.random() * 40) + 5; endY = 50
            }

            const riverNoise = createNoise2D()
            const riverPoints: any[] = []
            let lastNx = -1, lastNy = -1

            const recordPoint = (nx: number, ny: number) => {
                if (this.mapGrid[ny] && this.mapGrid[ny][nx] !== undefined) {
                    this.mapGrid[ny][nx] = 1
                    if (nx >= 2 && nx <= 48 && ny >= 2 && ny <= 48) {
                        if (!riverPoints.find(p => p.x === nx && p.y === ny)) riverPoints.push({ x: nx, y: ny })
                    }
                }
            }

            const carveRiverPath = (x0: number, y0: number, x1: number, y1: number) => {
                const dist = Math.hypot(x1 - x0, y1 - y0)
                const steps = Math.ceil(dist * 5)
                for (let i = 0; i <= steps; i++) {
                    const t = i / steps
                    const lx = x0 + (x1 - x0) * t; const ly = y0 + (y1 - y0) * t
                    const offset = riverNoise(lx / 20, ly / 20) * 4
                    let pdx = -(y1 - y0) / (dist || 1); let pdy = (x1 - x0) / (dist || 1)
                    const nx = Math.round(lx + pdx * offset); const ny = Math.round(ly + pdy * offset)

                    if (lastNx !== -1 && lastNy !== -1) {
                        if (Math.abs(nx - lastNx) >= 1 && Math.abs(ny - lastNy) >= 1) recordPoint(nx, lastNy)
                    }
                    recordPoint(nx, ny); lastNx = nx; lastNy = ny
                }
            }

            carveRiverPath(startX, startY, endX, endY)
        }

        let waterCount = 0
        for (let y = 0; y <= 50; y++) {
            for (let x = 0; x <= 50; x++) {
                if (this.mapGrid[y][x] === 1) waterCount++
            }
        }
        console.log("Water Count After Generation:", waterCount)

        this.bases.forEach(base => {
            const gridX = Math.round(base.x / 16)
            const gridY = Math.round(base.y / 16)
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const ny = gridY + dy
                    const nx = gridX + dx
                    if (ny >= 0 && ny <= 50 && nx >= 0 && nx <= 50) {
                        if (this.mapGrid[ny][nx] !== 1) this.mapGrid[ny][nx] = 0
                    }
                }
            }
        })

        waterCount = 0
        for (let y = 0; y <= 50; y++) {
            for (let x = 0; x <= 50; x++) {
                if (this.mapGrid[y][x] === 1) waterCount++
            }
        }
        console.log("Water Count After Bases:", waterCount)
    }
}

new MapSim().init()
