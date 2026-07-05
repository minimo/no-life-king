import * as PIXI from 'pixi.js'

export function createFloatingTextFactory(app: PIXI.Application, effectLayer: PIXI.Container) {
    return function createFloatingText(text: string, x: number, y: number, color: number = 0xffff00) {
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
                app.ticker.remove(ticker)
                label.destroy()
            }
        }
        app.ticker.add(ticker)
    }
}
