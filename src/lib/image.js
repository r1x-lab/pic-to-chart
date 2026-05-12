// Color matching: returns distance in RGB space
function colorDist(r, g, b, tr, tg, tb) {
  return Math.abs(r - tr) + Math.abs(g - tg) + Math.abs(b - tb)
}

// Extend traced points to cover the full calibrated pixel range [xMin, xMax].
// Columns at the left/right edges that were not detected are filled with y = 0,
// giving the user draggable anchor points across the entire X range.
export function extendToRange(pts, xMin, xMax, transform) {
  const lo = Math.round(xMin)
  const hi = Math.round(xMax)

  if (!pts.length) {
    // No trace at all — fill with y=0 as a neutral placeholder
    const zeroPy = transform.yToPy(0)
    return Array.from({ length: hi - lo + 1 }, (_, i) => {
      const px = lo + i
      return { px, py: zeroPy, x: transform.pxToX(px), y: 0 }
    })
  }

  const sorted = [...pts].sort((a, b) => a.px - b.px)
  const first = sorted[0]
  const last  = sorted[sorted.length - 1]

  // Extend flat from the boundary traced point so the sign is preserved.
  // e.g. a return-loss curve at -5 dB at the left edge stays at -5 dB,
  // not artificially jumps to 0.
  const left = []
  for (let px = lo; px < first.px; px++)
    left.push({ px, py: first.py, x: transform.pxToX(px), y: first.y })

  const right = []
  for (let px = last.px + 1; px <= hi; px++)
    right.push({ px, py: last.py, x: transform.pxToX(px), y: last.y })

  return [...left, ...sorted, ...right]
}

// Remove outlier points whose py deviates too far from their local median.
// Uses an adaptive threshold (8% of the total py range, min 10px) so it
// scales automatically whether the chart is tall or short.
// windowHalf controls how many neighbours on each side define the "local" median.
export function removeOutliers(pts, windowHalf = 12) {
  if (pts.length < 5) return pts
  const s = [...pts].sort((a, b) => a.px - b.px)
  const pyVals = s.map(p => p.py)
  const pyMin  = Math.min(...pyVals)
  const pyMax  = Math.max(...pyVals)
  const threshold = Math.max(10, (pyMax - pyMin) * 0.08)

  return s.filter((p, i) => {
    const lo  = Math.max(0, i - windowHalf)
    const hi  = Math.min(s.length - 1, i + windowHalf)
    const win = s.slice(lo, hi + 1).map(q => q.py)
    const med = medianOf(win)
    return Math.abs(p.py - med) <= threshold
  })
}

function medianOf(arr) {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

// Fill pixel-column gaps between traced points with linear interpolation.
// Ensures every integer px between the first and last detected point has a data point,
// so the user can drag anywhere — not just at detected color columns.
export function fillGaps(pts) {
  if (pts.length < 2) return pts
  // pts should already be sorted by px (traceCurve iterates left→right)
  const sorted = [...pts].sort((a, b) => a.px - b.px)
  const filled = []
  for (let i = 0; i < sorted.length - 1; i++) {
    filled.push(sorted[i])
    const p1 = sorted[i], p2 = sorted[i + 1]
    const gap = p2.px - p1.px
    if (gap > 1) {
      for (let step = 1; step < gap; step++) {
        const t = step / gap
        filled.push({
          px: p1.px + step,
          py: p1.py + t * (p2.py - p1.py),
          x:  p1.x  + t * (p2.x  - p1.x),
          y:  p1.y  + t * (p2.y  - p1.y)
        })
      }
    }
  }
  filled.push(sorted[sorted.length - 1])
  return filled
}

export function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
}

// Trace a curve by scanning each column for the target color
// Returns array of {px, py, x, y}
export function traceCurve(imgData, w, h, targetHex, tolerance, bounds, transform) {
  const [tr, tg, tb] = hexToRgb(targetHex)
  const { xMin, xMax, yMin, yMax } = bounds
  const pts = []
  const data = imgData.data

  for (let px = Math.round(xMin); px <= Math.round(xMax); px++) {
    const ys = []
    for (let py = Math.round(yMin); py <= Math.round(yMax); py++) {
      const i = (py * w + px) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      // skip very light pixels (background/grid)
      if (r > 235 && g > 235 && b > 235) continue
      if (colorDist(r, g, b, tr, tg, tb) < tolerance * 3) {
        ys.push(py)
      }
    }
    if (ys.length) {
      ys.sort((a, b) => a - b)
      // Take median for robustness against anti-aliasing edges
      const medPy = ys[Math.floor(ys.length / 2)]
      pts.push({
        px,
        py: medPy,
        x: transform.pxToX(px),
        y: transform.pxToY(medPy)
      })
    }
  }
  return pts
}

// Remove horizontal grid lines from image data
// Detects long runs of similar near-gray pixels and replaces with background
export function removeGridLines(imgData, w, h, bgColor = [255, 255, 255]) {
  const out = new ImageData(w, h)
  out.data.set(imgData.data)
  const data = out.data

  // For each row, count near-gray pixels (R≈G≈B and not too dark)
  for (let py = 0; py < h; py++) {
    let grayCount = 0
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const maxC = Math.max(r, g, b), minC = Math.min(r, g, b)
      if (maxC - minC < 15 && r > 180 && r < 240) grayCount++
    }
    // If row is mostly horizontal grid (>60% gray), erase it
    if (grayCount > w * 0.6) {
      for (let px = 0; px < w; px++) {
        const i = (py * w + px) * 4
        const r = data[i], g = data[i + 1], b = data[i + 2]
        const maxC = Math.max(r, g, b), minC = Math.min(r, g, b)
        if (maxC - minC < 15 && r > 180 && r < 240) {
          data[i] = bgColor[0]
          data[i + 1] = bgColor[1]
          data[i + 2] = bgColor[2]
        }
      }
    }
  }
  return out
}

// Sample average color in a small region (for color picker)
export function sampleColor(imgData, w, px, py, radius = 2) {
  const data = imgData.data
  let r = 0, g = 0, b = 0, n = 0
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = px + dx, y = py + dy
      if (x < 0 || y < 0 || x >= w) continue
      const i = (y * w + x) * 4
      // Skip white pixels to avoid background contamination
      if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) continue
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      n++
    }
  }
  if (n === 0) {
    const i = (py * w + px) * 4
    return [data[i], data[i + 1], data[i + 2]]
  }
  return [r / n, g / n, b / n]
}
