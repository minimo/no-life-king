import * as PIXI from 'pixi.js'
import { DARK_OWNER_COLORS, OWNER_COLORS } from './colors'
import { ellipseEdge, fromIso, HIGHLIGHT_HH, HIGHLIGHT_HW, HIGHLIGHT_OFFSET_Y, toIso } from './coords'
import type { Base, Point, Rank, Unit } from '~/types/game'

interface ArrowSource {
    x: number
    y: number
    rank?: Rank
}

interface DrawPathOptions {
    color: number
    darkColor: number
    alpha: number
    sourceRadius?: { a: number; b: number } | null
    targetRadius?: { a: number; b: number } | null
}

function drawPathArrow(g: PIXI.Graphics, isoPoints: Point[], options: DrawPathOptions) {
    if (isoPoints.length < 2) return

    const firstPt = isoPoints[0]!
    const lastPt = isoPoints[isoPoints.length - 1]!

    let startEdge = firstPt
    if (options.sourceRadius) {
        const firstNext = isoPoints[1]!
        const startAngle = Math.atan2(firstNext.y - firstPt.y, firstNext.x - firstPt.x)
        startEdge = ellipseEdge(firstPt.x, firstPt.y, options.sourceRadius.a, options.sourceRadius.b, startAngle)
    }

    let endEdge = lastPt
    const prevPt = isoPoints[isoPoints.length - 2]!
    if (options.targetRadius) {
        const endAngle = Math.atan2(prevPt.y - lastPt.y, prevPt.x - lastPt.x)
        endEdge = ellipseEdge(lastPt.x, lastPt.y, options.targetRadius.a, options.targetRadius.b, endAngle)
    }

    const distBetween = Math.hypot(endEdge.x - startEdge.x, endEdge.y - startEdge.y)
    if (distBetween <= 0) return

    // 線を描画（暗い縁取り）
    g.setStrokeStyle({ width: 7, color: options.darkColor, alpha: options.alpha })
    g.moveTo(startEdge.x, startEdge.y)
    for (let pi = 1; pi < isoPoints.length - 1; pi++) {
        g.lineTo(isoPoints[pi]!.x, isoPoints[pi]!.y)
    }
    g.lineTo(endEdge.x, endEdge.y)
    g.stroke()

    // 線を描画（メイン色）
    g.setStrokeStyle({ width: 5, color: options.color, alpha: options.alpha })
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
    const p2InnerX = p2x + (p3x - p2x) * ratio
    const p2InnerY = p2y + (p3y - p2y) * ratio
    const p3InnerX = p3x + (p2x - p3x) * ratio
    const p3InnerY = p3y + (p2y - p3y) * ratio

    g.setStrokeStyle({ width: 3, color: options.darkColor, alpha: options.alpha, join: 'round' })
    g.beginPath()
    g.moveTo(p2InnerX, p2InnerY)
    g.lineTo(p2x, p2y)
    g.lineTo(p1x, p1y)
    g.lineTo(p3x, p3y)
    g.lineTo(p3InnerX, p3InnerY)
    g.stroke()

    // メイン色塗りつぶし
    g.setStrokeStyle({ width: 0 })
    g.beginPath()
    g.moveTo(p1x, p1y)
    g.lineTo(p2x, p2y)
    g.lineTo(p3x, p3y)
    g.closePath()
    g.fill({ color: options.color, alpha: options.alpha })
}

export function renderArrow(
    g: PIXI.Graphics,
    source: ArrowSource,
    target: Point,
    sourceIsBase: boolean,
    targetIsBase: boolean,
    getPath: (sx: number, sy: number, tx: number, ty: number, rank: Rank) => Point[],
) {
    const sPos = toIso(source.x, source.y)
    const tPos = toIso(target.x, target.y)

    // 楕円中心（Y方向にオフセット）
    const sCx = sPos.x, sCy = sPos.y + HIGHLIGHT_OFFSET_Y
    const tCx = tPos.x, tCy = tPos.y + HIGHLIGHT_OFFSET_Y

    if (sCx === tCx && sCy === tCy) return

    const sourceRank = source.rank || 1
    const pathPoints = getPath(source.x, source.y, target.x, target.y, sourceRank)
    const isoPoints = pathPoints.map((p, index) => {
        const pt = toIso(p.x, p.y)
        if (index === 0 && sourceIsBase) return { x: pt.x, y: pt.y + HIGHLIGHT_OFFSET_Y }
        if (index === pathPoints.length - 1 && targetIsBase) return { x: pt.x, y: pt.y + HIGHLIGHT_OFFSET_Y }
        return pt
    })

    drawPathArrow(g, isoPoints, {
        color: 0x2ecc71,
        darkColor: 0x1a8a4a,
        alpha: 0.8,
        sourceRadius: sourceIsBase ? { a: HIGHLIGHT_HW, b: HIGHLIGHT_HH } : null,
        targetRadius: targetIsBase ? { a: HIGHLIGHT_HW, b: HIGHLIGHT_HH } : null,
    })
}

export function renderDragArrows(
    g: PIXI.Graphics,
    bases: Base[],
    units: Unit[],
    state: {
        multiSendTargetId: string | null
        draggingFromBaseId: string | null
        targetedBaseId: string | null
        mousePos: Point
    },
    getPath: (sx: number, sy: number, tx: number, ty: number, rank: Rank) => Point[],
) {
    g.clear()

    if (state.multiSendTargetId) {
        const target = bases.find(b => b.id === state.multiSendTargetId)
        if (target) {
            bases.filter(b => b.owner === 'player' && b.id !== target.id).forEach(source => {
                renderArrow(g, source, target, true, true, getPath)
            })
        }
    } else if (state.draggingFromBaseId) {
        const isFromUnit = state.draggingFromBaseId.startsWith('unit:')
        let source: { x: number, y: number, rank: Rank } | null = null

        if (isFromUnit) {
            const unitId = state.draggingFromBaseId.split(':')[1]
            const unit = units.find(u => u.id === unitId)
            if (unit) source = { x: unit.x, y: unit.y, rank: unit.rank }
        } else {
            const base = bases.find((b: Base) => b.id === state.draggingFromBaseId)
            if (base) source = { x: base.x, y: base.y, rank: base.rank }
        }

        if (source) {
            const target = state.targetedBaseId ? bases.find((b: Base) => b.id === state.targetedBaseId) : null
            // Supress if source and target are same
            if (!target || (state.draggingFromBaseId !== target.id)) {
                // mousePos is in screenspace, logical source.x/y is needed for consistency
                // renderArrow will handle the conversion
                renderArrow(g, source, target || fromIso(state.mousePos.x, state.mousePos.y), !isFromUnit, !!target, getPath)
            }
        }
    }
}

export function renderSelectedUnitPath(
    g: PIXI.Graphics,
    selectedUnitId: string | null,
    units: Unit[],
    bases: Base[],
    hasUnitVisual: (id: string) => boolean,
    clearSelection: () => void,
) {
    g.clear()
    if (!selectedUnitId) return

    const selUnit = units.find(u => u.id === selectedUnitId)
    if (selUnit && selUnit.path.length > 1) {
        const color = OWNER_COLORS[selUnit.owner]
        const darkColor = DARK_OWNER_COLORS[selUnit.owner]

        // 選択枠（楕円）
        if (hasUnitVisual(selUnit.id) && !selUnit.isFighting) {
            const uPos = toIso(selUnit.x, selUnit.y)
            g.setStrokeStyle({ width: 5, color: darkColor, alpha: 1.0 }) // 暗い縁
            g.ellipse(uPos.x, uPos.y + HIGHLIGHT_OFFSET_Y, 16, 12)
            g.stroke()

            g.setStrokeStyle({ width: 3, color, alpha: 1.0 })
            g.ellipse(uPos.x, uPos.y + HIGHLIGHT_OFFSET_Y, 16, 12)
            g.stroke()
        }

        // 目標拠点の枠
        const targetBase = bases.find(b => b.id === selUnit.targetId)
        if (targetBase) {
            const tPos = toIso(targetBase.x, targetBase.y)
            g.setStrokeStyle({ width: 5, color: darkColor, alpha: 1.0 }) // 暗い縁
            g.ellipse(tPos.x, tPos.y + HIGHLIGHT_OFFSET_Y, HIGHLIGHT_HW, HIGHLIGHT_HH)
            g.stroke()

            g.setStrokeStyle({ width: 3, color, alpha: 1.0 })
            g.ellipse(tPos.x, tPos.y + HIGHLIGHT_OFFSET_Y, HIGHLIGHT_HW, HIGHLIGHT_HH)
            g.stroke()
        }

        // パスルート描画（枠から枠まで）
        const startIdx = selUnit.pathIndex
        const startIso = toIso(selUnit.x, selUnit.y)

        // 全ウェイポイントをISO座標に変換
        const isoPoints: Point[] = [{ x: startIso.x, y: startIso.y + HIGHLIGHT_OFFSET_Y }]
        for (let pi = startIdx + 1; pi < selUnit.path.length; pi++) {
            const wp = selUnit.path[pi]!
            const point = toIso(wp.x, wp.y)
            const isLast = pi === selUnit.path.length - 1
            isoPoints.push(isLast ? { x: point.x, y: point.y + HIGHLIGHT_OFFSET_Y } : point)
        }

        if (isoPoints.length >= 2) {
            // 楕円が接触していたら線と矢印を省略
            const lastPt = isoPoints[isoPoints.length - 1]!
            const firstPt = isoPoints[0]!
            const distBetween = Math.hypot(lastPt.x - firstPt.x, lastPt.y - firstPt.y)
            const touchThreshold = (16 + HIGHLIGHT_HW) // ユニット楕円横半径 + 目標楕円横半径
            if (distBetween > touchThreshold) {
                drawPathArrow(g, isoPoints, {
                    color,
                    darkColor,
                    alpha: 1.0,
                    sourceRadius: { a: 16, b: 12 },
                    targetRadius: targetBase ? { a: HIGHLIGHT_HW, b: HIGHLIGHT_HH } : null,
                })
            }
        }
    } else {
        // ユニットが消えたら選択解除
        clearSelection()
    }
}
