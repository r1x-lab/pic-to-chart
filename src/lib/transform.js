// Coordinate transforms between pixel space and data space
// Supports linear and log X axis (log Y rarely needed for RF return loss)

export function makeTransform(cal, xScale = 'linear') {
  // cal: { x1: {px, val}, x2: {px, val}, y1: {py, val}, y2: {py, val} }
  // Returns: { pxToX, pxToY, xToPx, yToPy }
  const xLogA = xScale === 'log' ? Math.log10(cal.x1.val) : cal.x1.val
  const xLogB = xScale === 'log' ? Math.log10(cal.x2.val) : cal.x2.val

  const pxToX = (px) => {
    const t = (px - cal.x1.px) / (cal.x2.px - cal.x1.px)
    const v = xLogA + t * (xLogB - xLogA)
    return xScale === 'log' ? Math.pow(10, v) : v
  }
  const xToPx = (xv) => {
    const v = xScale === 'log' ? Math.log10(xv) : xv
    const t = (v - xLogA) / (xLogB - xLogA)
    return cal.x1.px + t * (cal.x2.px - cal.x1.px)
  }
  const pxToY = (py) => {
    const t = (py - cal.y1.py) / (cal.y2.py - cal.y1.py)
    return cal.y1.val + t * (cal.y2.val - cal.y1.val)
  }
  const yToPy = (yv) => {
    const t = (yv - cal.y1.val) / (cal.y2.val - cal.y1.val)
    return cal.y1.py + t * (cal.y2.py - cal.y1.py)
  }
  return { pxToX, pxToY, xToPx, yToPy }
}

export function isCalibrationComplete(cal) {
  return cal.x1 && cal.x2 && cal.y1 && cal.y2
}
