import { useEffect, useRef } from 'react'

export default function PreviewChart({ curves, activeCurveIdx, xRange, height = 320 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    const w = cv.clientWidth
    const h = height
    cv.width  = w * dpr
    cv.height = h * dpr
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const pad = { l: 50, r: 16, t: 12, b: 32 }
    const allY = []
    curves.forEach(c => c.visible && c.pts.forEach(p => allY.push(p.y)))

    if (!allY.length) {
      ctx.fillStyle = '#9ca3af'
      ctx.font = '13px sans-serif'
      ctx.fillText('擷取曲線後即可預覽', pad.l, h / 2)
      return
    }

    const { xFrom, xTo } = xRange
    const yMin = Math.min(...allY)
    const yMax = Math.max(...allY)
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
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke()
    }

    // Axes
    ctx.strokeStyle = '#d1d5db'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, h - pad.b); ctx.lineTo(w - pad.r, h - pad.b)
    ctx.stroke()

    // Tick labels
    ctx.fillStyle = '#6b7280'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    for (let i = 0; i <= 6; i++) {
      const xv = xFrom + ((xTo - xFrom) * i) / 6
      ctx.fillText(fmt(xv), xS(xv), h - pad.b + 16)
    }
    ctx.textAlign = 'right'
    for (let i = 0; i <= 6; i++) {
      const yv = yLo + ((yHi - yLo) * i) / 6
      ctx.fillText(yv.toFixed(2), pad.l - 6, yS(yv) + 4)
    }

    // Curves
    curves.forEach((c, ci) => {
      if (!c.pts.length || !c.visible) return
      const sorted = [...c.pts].sort((a, b) => a.x - b.x)
      ctx.strokeStyle = c.color
      ctx.lineWidth = ci === activeCurveIdx ? 2 : 1.5
      ctx.beginPath()
      sorted.forEach((p, i) => {
        const X = xS(p.x), Y = yS(p.y)
        i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y)
      })
      ctx.stroke()
    })
  }, [curves, activeCurveIdx, xRange, height])

  useEffect(() => {
    const onResize = () => {
      const cv = canvasRef.current
      if (!cv) return
      cv.dispatchEvent(new Event('resize'))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2" style={{ height: height + 16 }}>
      <canvas ref={canvasRef} className="block w-full" style={{ height }} />
    </div>
  )
}

function fmt(n) {
  if (Math.abs(n) >= 1000) return n.toFixed(0)
  if (Math.abs(n) >= 10)   return n.toFixed(1)
  return n.toFixed(2)
}
