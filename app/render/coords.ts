export const LOGICAL_SIZE = 832
export const SCALE_X = 2.0
export const SCALE_Y = 1.0

export const TILE_WIDTH_PX = 64
export const TILE_HEIGHT_PX = 32
export const ISO_CENTER_X = 960
export const ISO_CENTER_Y = 540

// ハイライト楕円のパラメータ（スクリーン座標）
export const HIGHLIGHT_HW = 28
export const HIGHLIGHT_HH = 20
export const HIGHLIGHT_OFFSET_Y = -8

export function toIso(logicalX: number, logicalY: number) {
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

export function fromIso(screenX: number, screenY: number) {
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

/** 楕円外周上の点を求める: 楕円中心から角度 angle 方向の外周座標を返す */
export function ellipseEdge(cx: number, cy: number, a: number, b: number, angle: number) {
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    // 楕円 x²/a² + y²/b² = 1 と原点からの直線の交点距離
    const r = 1 / Math.sqrt((cosA * cosA) / (a * a) + (sinA * sinA) / (b * b))
    return { x: cx + r * cosA, y: cy + r * sinA }
}
