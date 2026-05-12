import { useEffect, useRef, useState, useCallback } from 'react'
import { makeTransform, isCalibrationComplete } from '../lib/transform'
import { getWeight } from '../lib/math'
import { sampleColor, rgbToHex } from '../lib/image'

export default function ImageCanvas({
  imgEl,
  imgData,
  cal,
  xScale = 'linear',
  curves,
  activeCurveIdx,
  onCanvasClick,
  onUpdateCurve,
  onDragStart,
  onUndo,
  canUndo = false,
  brushRadius = 5,
  weightKind = 'gaussian',
  cursorMode,
  maxWidth = 880
}) {
  const canvasRef = useRef(null)
  const [drag, setDrag] = useState(null)
  const [hoverPt, setHoverPt] = useState(null)
  const [mousePos, setMousePos] = useState(null) // canvas coords for crosshair
  const [colorSwatch, setColorSwatch] = useState(null) // { hex, domX, domY } during pick-color

  const calComplete = isCalibrationComplete(cal)

  // ── DRAW ──────────────────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !imgEl) return

    // Canvas logical size = full imgData resolution so that all pixel coords
    // (calibration, tracing, sampling) are in the same coordinate space.
    // CSS max-w-full + getPos()'s cv.width/r.width scaling handle visual downsizing.
    cv.width  = imgEl.width
    cv.height = imgEl.height
    const ctx = cv.getContext('2d')

    // Image
    if (imgData) {
      ctx.putImageData(imgData, 0, 0)
    } else {
      ctx.drawImage(imgEl, 0, 0, cv.width, cv.height)
    }

    // Calibration markers
    const drawMarker = (px, py, label, color) => {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(px, py, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = '#000'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(label, px + 9, py - 8)
    }
    if (cal.x1) drawMarker(cal.x1.px, cal.x1.py, 'X1', '#dc2626')
    if (cal.x2) drawMarker(cal.x2.px, cal.x2.py, 'X2', '#dc2626')
    if (cal.y1) drawMarker(cal.y1.px, cal.y1.py, 'Y1', '#2563eb')
    if (cal.y2) drawMarker(cal.y2.px, cal.y2.py, 'Y2', '#2563eb')

    // Curves
    curves.forEach((c, ci) => {
      if (!c.visible) return
      const isActive = ci === activeCurveIdx

      // Current editable curve
      if (c.pts.length) {
        ctx.save()
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = isActive ? 2.5 : 1.5
        ctx.beginPath()
        c.pts.forEach((p, i) => {
          i === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py)
        })
        ctx.stroke()
        ctx.restore()
      }

      // Drag handles for active curve (downsampled to avoid clutter)
      if (isActive && c.pts.length) {
        const step = Math.max(1, Math.floor(c.pts.length / 100))
        ctx.fillStyle = '#ef4444'
        for (let i = 0; i < c.pts.length; i += step) {
          const p = c.pts[i]
          ctx.beginPath()
          ctx.arc(p.px, p.py, 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    })

    // Hover highlight
    if (hoverPt) {
      const cv2 = curves[hoverPt.ci]
      if (cv2) {
        const p = cv2.pts[hoverPt.pi]
        if (p) {
          ctx.save()
          ctx.fillStyle = '#ef4444'
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(p.px, p.py, 8, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
          ctx.restore()
        }
      }
    }

    // Calibration crosshair — full-canvas lines that follow the cursor
    if (cursorMode?.startsWith('cal-') && mousePos) {
      const isYAxis = cursorMode === 'cal-y1' || cursorMode === 'cal-y2'
      const lineColor = isYAxis ? '#2563eb' : '#dc2626'

      ctx.save()
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 1
      ctx.setLineDash([6, 4])
      ctx.globalAlpha = 0.75

      // Vertical line
      ctx.beginPath()
      ctx.moveTo(mousePos.x, 0)
      ctx.lineTo(mousePos.x, cv.height)
      ctx.stroke()

      // Horizontal line
      ctx.beginPath()
      ctx.moveTo(0, mousePos.y)
      ctx.lineTo(cv.width, mousePos.y)
      ctx.stroke()

      ctx.setLineDash([])
      ctx.globalAlpha = 1

      // Center marker circle
      ctx.fillStyle = lineColor
      ctx.beginPath()
      ctx.arc(mousePos.x, mousePos.y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Coordinate label
      ctx.font = 'bold 12px monospace'
      ctx.fillStyle = lineColor
      ctx.globalAlpha = 0.9
      const label = `${Math.round(mousePos.x)}, ${Math.round(mousePos.y)}`
      const lx = mousePos.x + 10 > cv.width - 80 ? mousePos.x - 85 : mousePos.x + 10
      const ly = mousePos.y - 10 < 16 ? mousePos.y + 20 : mousePos.y - 8
      ctx.fillText(label, lx, ly)

      ctx.restore()
    }

    // Color-pick mode: draw sampling circle at cursor
    if (cursorMode === 'pick-color' && mousePos) {
      ctx.save()
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.globalAlpha = 0.8
      ctx.beginPath()
      ctx.arc(mousePos.x, mousePos.y, 6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 0.75
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(mousePos.x, mousePos.y, 6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }, [imgEl, imgData, cal, curves, activeCurveIdx, hoverPt, mousePos, cursorMode, maxWidth])

  // ── COORDS ────────────────────────────────────────────────────
  // Returns canvas-pixel coordinates (pt.px/pt.py space)
  const getPos = useCallback((e) => {
    const cv = canvasRef.current
    const r  = cv.getBoundingClientRect()
    const sx = cv.width  / r.width
    const sy = cv.height / r.height
    return {
      x: (e.clientX - r.left) * sx,
      y: (e.clientY - r.top)  * sy
    }
  }, [])

  // ── HIT TEST ──────────────────────────────────────────────────
  const findNearest = useCallback((cx, cy) => {
    const curve = curves[activeCurveIdx]
    if (!curve?.pts.length) return null
    let best = Infinity, bestI = -1
    for (let i = 0; i < curve.pts.length; i++) {
      const d = Math.hypot(curve.pts[i].px - cx, curve.pts[i].py - cy)
      if (d < best) { best = d; bestI = i }
    }
    // 14 canvas-pixel hit radius
    return best < 14 ? { ci: activeCurveIdx, pi: bestI } : null
  }, [curves, activeCurveIdx])

  // ── MOUSE DOWN ────────────────────────────────────────────────
  const onMouseDown = useCallback((e) => {
    if (!imgEl || cursorMode || !calComplete || !onUpdateCurve) return
    const { x, y } = getPos(e)
    const hit = findNearest(x, y)
    if (!hit) return
    e.preventDefault()
    onDragStart?.()

    const curve  = curves[hit.ci]
    const startPts = curve.pts.map(p => ({ ...p }))
    // Build sorted order + O(1) lookup table
    const sorted = startPts
      .map((p, i) => ({ ...p, origIdx: i }))
      .sort((a, b) => a.px - b.px)
    const origToSorted = new Array(startPts.length)
    sorted.forEach((sp, si) => { origToSorted[sp.origIdx] = si })
    const sortedPtIdx = origToSorted[hit.pi]

    setDrag({ startPts, sorted, origToSorted, sortedPtIdx, startY: y })
  }, [imgEl, cursorMode, calComplete, onUpdateCurve, curves, activeCurveIdx, getPos, findNearest])

  // ── MOUSE MOVE ────────────────────────────────────────────────
  const onMouseMove = useCallback((e) => {
    const { x, y } = getPos(e)
    setMousePos({ x, y })

    if (drag && calComplete && onUpdateCurve) {
      const dy = y - drag.startY   // canvas pixels (positive = downward)
      const t  = makeTransform(cal, xScale)

      const newPts = drag.startPts.map((p, origIdx) => {
        const si   = drag.origToSorted[origIdx]
        const dist = Math.abs(si - drag.sortedPtIdx)
        const w    = getWeight(weightKind, dist, brushRadius)
        if (w === 0) return p
        const newPy = p.py + dy * w
        return { ...p, py: newPy, y: t.pxToY(newPy) }
      })

      onUpdateCurve(activeCurveIdx, newPts)
      return
    }

    if (cursorMode === 'pick-color' && imgData) {
      const [r, g, b] = sampleColor(imgData, imgData.width, Math.round(x), Math.round(y), 3)
      const hex = rgbToHex(r, g, b)
      const rect = canvasRef.current.getBoundingClientRect()
      setColorSwatch({ hex, domX: e.clientX - rect.left, domY: e.clientY - rect.top })
    } else {
      setColorSwatch(null)
    }

    if (!cursorMode) {
      setHoverPt(findNearest(x, y))
    }
  }, [drag, calComplete, onUpdateCurve, cal, xScale, weightKind, brushRadius,
      activeCurveIdx, cursorMode, imgData, getPos, findNearest])

  // ── MOUSE UP ──────────────────────────────────────────────────
  const onMouseUp = useCallback(() => setDrag(null), [])

  // ── CLICK (calibration / color pick) ─────────────────────────
  const handleClick = useCallback((e) => {
    if (drag || !imgEl) return
    const cv = canvasRef.current
    const r  = cv.getBoundingClientRect()
    const sx = cv.width  / r.width
    const sy = cv.height / r.height
    const x  = (e.clientX - r.left) * sx
    const y  = (e.clientY - r.top)  * sy
    onCanvasClick?.(x, y, e)
  }, [drag, imgEl, onCanvasClick])

  // ── CURSOR ────────────────────────────────────────────────────
  const cursorClass = drag
    ? 'cursor-ns-resize'
    : hoverPt
    ? 'cursor-grab'
    : cursorMode?.startsWith('cal-')
    ? 'cursor-none'       // hide system cursor — our drawn crosshair replaces it
    : cursorMode
    ? 'cursor-crosshair'
    : 'cursor-default'

  // ── RENDER ────────────────────────────────────────────────────
  if (!imgEl) {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center text-gray-400 bg-white">
        上傳圖片以開始
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-1.5 px-1">
        <span className="text-xs text-gray-500 flex-1">
          {calComplete
            ? `在圖片上直接拖曳點位調整（筆刷半徑 ${brushRadius}）`
            : '請先完成座標軸校準'}
        </span>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="復原 (Ctrl+Z)"
          className="text-xs px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ↩ 復原
        </button>
      </div>

      {/* Canvas wrapper — relative so the swatch overlay can be absolutely positioned */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { setHoverPt(null); setDrag(null); setMousePos(null); setColorSwatch(null) }}
          onClick={handleClick}
          className={`block max-w-full ${cursorClass}`}
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Live color swatch during pick-color */}
        {colorSwatch && cursorMode === 'pick-color' && (
          <div
            className="absolute pointer-events-none flex items-center gap-1.5 bg-white border border-gray-400 rounded shadow-md px-2 py-1 z-10"
            style={{ left: colorSwatch.domX + 16, top: colorSwatch.domY - 14 }}
          >
            <div
              className="w-5 h-5 rounded-sm border border-gray-300 shrink-0"
              style={{ background: colorSwatch.hex }}
            />
            <span className="text-[11px] font-mono text-gray-700 select-none">{colorSwatch.hex}</span>
          </div>
        )}
      </div>

      {/* Pick-mode instruction */}
      {cursorMode && (
        <div className="mt-2 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs rounded">
          {cursorMode.startsWith('cal-')
            ? `請點選 ${cursorMode.replace('cal-', '').toUpperCase()} 的對應位置`
            : cursorMode === 'pick-color'
            ? `請將滑鼠移至曲線上，預覽框會顯示取樣顏色，確認後點擊以套用${colorSwatch ? `　目前：${colorSwatch.hex}` : ''}`
            : ''}
        </div>
      )}
    </div>
  )
}
