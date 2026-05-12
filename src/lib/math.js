// PCHIP monotonic cubic Hermite interpolation
// Better than cubic spline for curves with sharp peaks (no overshoot)
export function pchipInterp(xs, ys, xNew) {
  const n = xs.length
  if (n < 2) return xNew.map(() => NaN)
  const h = [], d = []
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i])
    d.push((ys[i + 1] - ys[i]) / h[i])
  }
  const m = new Array(n).fill(0)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) {
      m[i] = 0
    } else {
      const w1 = 2 * h[i] + h[i - 1]
      const w2 = h[i] + 2 * h[i - 1]
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    }
  }
  return xNew.map(x => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let i = 0
    while (x > xs[i + 1]) i++
    const t = (x - xs[i]) / h[i]
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1
    const h10 = t ** 3 - 2 * t ** 2 + t
    const h01 = -2 * t ** 3 + 3 * t ** 2
    const h11 = t ** 3 - t ** 2
    return h00 * ys[i] + h10 * h[i] * m[i] + h01 * ys[i + 1] + h11 * h[i] * m[i + 1]
  })
}

// Savitzky-Golay smoothing filter (degree 2 or 3, symmetric window)
// Pre-computed coefficients for common window sizes (degree 2)
const SG_COEFFS = {
  5:  [-3, 12, 17, 12, -3],
  7:  [-2, 3, 6, 7, 6, 3, -2],
  9:  [-21, 14, 39, 54, 59, 54, 39, 14, -21],
  11: [-36, 9, 44, 69, 84, 89, 84, 69, 44, 9, -36],
  13: [-11, 0, 9, 16, 21, 24, 25, 24, 21, 16, 9, 0, -11],
  15: [-78, -13, 42, 87, 122, 147, 162, 167, 162, 147, 122, 87, 42, -13, -78],
  17: [-21, -6, 7, 18, 27, 34, 39, 42, 43, 42, 39, 34, 27, 18, 7, -6, -21],
  19: [-136, -51, 24, 89, 144, 189, 224, 249, 264, 269, 264, 249, 224, 189, 144, 89, 24, -51, -136],
  21: [-171, -76, 9, 84, 149, 204, 249, 284, 309, 324, 329, 324, 309, 284, 249, 204, 149, 84, 9, -76, -171]
}
const SG_NORMS = { 5: 35, 7: 21, 9: 231, 11: 429, 13: 143, 15: 1105, 17: 323, 19: 2261, 21: 3059 }

export function savitzkyGolay(ys, window = 9) {
  // Snap window to nearest available odd size
  const sizes = Object.keys(SG_COEFFS).map(Number).sort((a, b) => a - b)
  let w = sizes[0]
  for (const s of sizes) if (Math.abs(s - window) < Math.abs(w - window)) w = s
  if (ys.length < w) return ys.slice()

  const coeffs = SG_COEFFS[w]
  const norm = SG_NORMS[w]
  const half = Math.floor(w / 2)
  const out = new Array(ys.length)

  for (let i = 0; i < ys.length; i++) {
    if (i < half || i >= ys.length - half) {
      out[i] = ys[i] // keep edges as-is
    } else {
      let sum = 0
      for (let j = -half; j <= half; j++) {
        sum += coeffs[j + half] * ys[i + j]
      }
      out[i] = sum / norm
    }
  }
  return out
}

// Weight functions for connected drag editing
// Returns weight in [0, 1] given normalized distance t in [0, 1]
export function gaussianWeight(t) {
  // sigma chosen so weight at t=1 (edge of brush) ≈ 0.135
  const sigma = 0.5
  return Math.exp(-(t * t) / (2 * sigma * sigma))
}

export function cosineWeight(t) {
  if (t >= 1) return 0
  return 0.5 * (1 + Math.cos(Math.PI * t))
}

export function getWeight(kind, distancePts, brushRadiusPts) {
  if (brushRadiusPts <= 0) return distancePts === 0 ? 1 : 0
  const t = Math.abs(distancePts) / brushRadiusPts
  if (t >= 1) return 0
  return kind === 'cosine' ? cosineWeight(t) : gaussianWeight(t)
}
