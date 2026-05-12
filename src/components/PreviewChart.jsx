import { useEffect, useRef, useState, useCallback } from 'react'
import { getWeight } from '../lib/math'

// Preview chart with connected-drag editing
// - Shows all curves in data-space coordinates
// - Drag a point to move it; brushRadius>0 ripples nearby points with weighted falloff
export default function PreviewChart({
  curves,
  activeCurveIdx,
  xRange,
  brushRadius,      // number of neighbor points on each side (0 = single point only)
  weightKind,       // 'gaussian' | 'cosine'
  onUpdateCurve,    // (idx, newPts) => void
  height = 320
}) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const [hover, setHover] = useState(null) // {curveIdx, ptIdx, x, y}
  const [dragging, setDragging] = useState(null) // {ptIdx, startY, startPts}
  const [transformCache, setTransformCache] = useState(null)

  const flatPoints = (() => {
    const allY = []
    curves.forEach(c => c.visible && c.pts.forEach(p => allY.push(p.y)))
    return allY
  })()

  // Draw the chart
  const draw = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    const w = cv.clientWidth
    const h = height
    cv.width = w * dpr
    cv.height = h * dpr
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const pad = { l: 50, r: 16, t: 12, b: 32 }

    if (!flatPoints.length) {
      ctx.fillStyle = '#9ca3af'
      ctx.font = '13px sans-serif'
      ctx.fillText('擷取曲線後即可預覽', pad.l, h / 2)
      return
    }

    const { xFrom, xTo } = xRange
    const yMin = Math.min(...flatPoints)
    const yMax = Math.max(...flatPoints)
    const yPad = (yMax - yMin) * 0.1 || 1
    const yLo = yMin - yPad
    const yHi = yMax + yPad

    const plotW = w - pad.l - pad.r
    const plotH = h - pad.t - pad.b
    const xS = v => pad.l + ((v - xFrom) / (xTo - xFrom)) * plotW
    const yS = v => pad.t + (1 - (v - yLo) / (yHi - yLo)) * plotH

    // Grid
    ctx.strokeStyle = '#f3f4f6'
    ctx.lineWidth = 1
    for (let i = 0; i <= 6; i++) {
      const y = pad.t + (plotH * i) / 6
      ctx.beginPath()
      ctx.moveTo(pad.l, y)
      ctx.lineTo(w - pad.r, y)
      ctx.stroke()
    }
    // Axes
    ctx.strokeStyle = '#d1d5db'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(pad.l, pad.t)
    ctx.lineTo(pad.l, h - pad.b)
    ctx.lineTo(w - pad.r, h - pad.b)
    ctx.stroke()

    // Tick labels
    ctx.fillStyle = '#6b7280'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    for (let i = 0; i <= 6; i++) {
      const xv = xFrom + ((xTo - xFrom) * i) / 6
      ctx.fillText(formatNumber(xv), xS(xv), h - pad.b + 16)
    }
    ctx.textAlign = 'right'
    for (let i = 0; i <= 6; i++) {
      const yv = yLo + ((yHi - yLo) * i) / 6
      ctx.fillText(yv.toFixed(2), pad.l - 6, yS(yv) + 4)
    }

    // Plot curves
    curves.forEach((c, ci) => {
      if (!c.pts.length || !c.visible) return
      const sorted = [...c.pts].sort((a, b) => a.x - b.x)
      ctx.strokeStyle = c.color
      ctx.lineWidth = ci === activeCurveIdx ? 2 : 1.5
      ctx.beginPath()
      sorted.forEach((p, i) => {
        const X = xS(p.x), Y = yS(p.y)
        if (i === 0) ctx.moveTo(X, Y)
        else ctx.lineTo(X, Y)
      })
      ctx.stroke()

      // Handles for active curve - downsample to avoid clutter
      if (ci === activeCurveIdx) {
        const step = Math.max(1, Math.floor(sorted.length / 40))
        ctx.fillStyle = c.color
        for (let i = 0; i < sorted.length; i += step) {
          const X = xS(sorted[i].x), Y = yS(sorted[i].y)
          ctx.beginPath()
          ctx.arc(X, Y, 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    })

    // Cache transform for hit testing
    setTransformCache({ xS, yS, yLo, yHi, pad, w, h, plotW, plotH })
  }, [curves, activeCurveIdx, xRange, height, flatPoints.length])

  useEffect(() => { draw() }, [draw])
  useEffect(() => {
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [draw])

  // Draw overlay (brush radius indicator while dragging or hovering)
  useEffect(() => {
    const ov = overlayRef.current
    if (!ov || !transformCache) return
    const dpr = window.devicePixelRatio || 1
    ov.width = transformCache.w * dpr
    ov.height = transformCache.h * dpr
    const ctx = ov.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, transformCache.w, transformCache.h)

    const showHandle = dragging || hover
    if (!showHandle) return
    const curve = curves[activeCurveIdx]
    if (!curve || !curve.pts.length) return
    const sorted = [...curve.pts].sort((a, b) => a.x - b.x)
    const targetIdx = dragging ? dragging.ptIdx : hover.ptIdx
    if (targetIdx == null || targetIdx < 0 || targetIdx >= sorted.length) return

    const target = sorted[targetIdx]
    const targetX = transformCache.xS(target.x)
    const targetY = transformCache.yS(target.y)

    // Draw brush radius (in screen X based on adjacent point spacing)
    if (brushRadius > 0) {
      // Estimate average dx in data space, convert to screen
      const dxData = sorted.length > 1 ? (sorted[sorted.length - 1].x - sorted[0].x) / (sorted.length - 1) : 0
      const radiusX = Math.abs(transformCache.xS(target.x + brushRadius * dxData) - targetX)

      // Falloff envelope (visualization of weight function)
      ctx.strokeStyle = curve.color + '66'
      ctx.fillStyle = curve.color + '15'
      ctx.lineWidth = 1
      ctx.beginPath()
      const steps = 50
      for (let i = -steps; i <= steps; i++) {
        const t = i / steps
        const distPts = Math.abs(t) * brushRadius
        const w = getWeight(weightKind, distPts, brushRadius)
        const px = targetX + t * radiusX
        const py = targetY - w * 25 // 25px tall envelope
        if (i === -steps) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()

      // Vertical lines at edges
      ctx.strokeStyle = curve.color + '44'
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(targetX - radiusX, transformCache.pad.t)
      ctx.lineTo(targetX - radiusX, transformCache.h - transformCache.pad.b)
      ctx.moveTo(targetX + radiusX, transformCache.pad.t)
      ctx.lineTo(targetX + radiusX, transformCache.h - transformCache.pad.b)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Big handle on target point
    ctx.fillStyle = curve.color
    ctx.beginPath()
    ctx.arc(targetX, targetY, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
  }, [hover, dragging, brushRadius, weightKind, curves, activeCurveIdx, transformCache])

  // Find nearest point to mouse
  const findNearest = useCallback((mx, my) => {
    if (!transformCache) return null
    const curve = curves[activeCurveIdx]
    if (!curve || !curve.pts.length) return null
    const sorted = [...curve.pts].sort((a, b) => a.x - b.x)
    let bestI = -1, bestD = Infinity
    sorted.forEach((p, i) => {
      const X = transformCache.xS(p.x)
      const Y = transformCache.yS(p.y)
      const d = Math.hypot(X - mx, Y - my)
      if (d < bestD) { bestD = d; bestI = i }
    })
    if (bestD < 18) return { ptIdx: bestI, sorted }
    return null
  }, [curves, activeCurveIdx, transformCache])

  const getMouse = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { mx: e.clientX - r.left, my: e.clientY - r.top }
  }

  const onMouseDown = (e) => {
    const { mx, my } = getMouse(e)
    const hit = findNearest(mx, my)
    if (!hit) return
    const curve = curves[activeCurveIdx]
    const startPts = curve.pts.map(p => ({ ...p }))
    setDragging({
      ptIdx: hit.ptIdx,
      sorted: hit.sorted,
      startY: hit.sorted[hit.ptIdx].y,
      startMouseY: my,
      startPts
    })
  }

  const onMouseMove = (e) => {
    const { mx, my } = getMouse(e)
    if (!dragging) {
      const hit = findNearest(mx, my)
      setHover(hit ? { ptIdx: hit.ptIdx } : null)
      return
    }
    if (!transformCache) return

    // Convert mouse Y delta to data Y delta
    const { yLo, yHi, plotH } = transformCache
    const dyMouse = my - dragging.startMouseY
    const dyData = -(dyMouse / plotH) * (yHi - yLo)

    // Apply weighted update
    const sorted = dragging.sorted
    const targetSortIdx = dragging.ptIdx
    const startPts = dragging.startPts

    // Map sorted index -> original index in curve.pts
    // We need to update original pts array order, but apply weights based on sorted neighbors
    const sortedToOriginal = sorted.map(sp => startPts.findIndex(op => op === sp || (op.px === sp.px && op.py === sp.py && op.x === sp.x && op.y === sp.y)))
    // Simpler: rebuild from sorted with updates, then preserve original ordering
    const updatedSorted = sorted.map((p, i) => {
      const dist = Math.abs(i - targetSortIdx)
      const w = getWeight(weightKind, dist, brushRadius)
      return { ...p, y: p.y + dyData * w }
    })

    // Reconstruct curve.pts in its original order
    const newPts = startPts.map(orig => {
      const idx = sorted.indexOf(orig)
      if (idx >= 0) return updatedSorted[idx]
      // fallback: match by reference identity not found (shouldn't happen since we spread above)
      const found = sorted.findIndex(sp => sp.px === orig.px && sp.py === orig.py)
      return found >= 0 ? updatedSorted[found] : orig
    })

    onUpdateCurve?.(activeCurveIdx, newPts)
  }

  const onMouseUp = () => {
    setDragging(null)
  }

  useEffect(() => {
    if (!dragging) return
    const up = () => setDragging(null)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [dragging])

  return (
    <div className="relative bg-white border border-gray-200 rounded-lg p-2" style={{ height: height + 16 }}>
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => setHover(null)}
        className="block w-full cursor-grab active:cursor-grabbing"
        style={{ height: height }}
      />
      <canvas
        ref={overlayRef}
        className="absolute inset-2 pointer-events-none"
        style={{ height: height }}
      />
    </div>
  )
}

function formatNumber(n) {
  if (Math.abs(n) >= 1000) return n.toFixed(0)
  if (Math.abs(n) >= 10) return n.toFixed(1)
  return n.toFixed(2)
}
