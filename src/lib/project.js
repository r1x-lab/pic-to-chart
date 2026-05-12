// Save/load project state as JSON
const VERSION = 1

export function serializeProject(state) {
  return {
    version: VERSION,
    timestamp: new Date().toISOString(),
    calibration: state.cal,
    xScale: state.xScale,
    curves: state.curves.map(c => ({
      name: c.name,
      color: c.color,
      pts: c.pts.map(p => ({ x: p.x, y: p.y, px: p.px, py: p.py }))
    })),
    exportSettings: {
      nPoints: state.nPoints,
      xFrom: state.xFrom,
      xTo: state.xTo,
      smoothWindow: state.smoothWindow
    },
    imageDataUrl: state.imageDataUrl || null
  }
}

export function deserializeProject(json) {
  if (!json || !json.version) throw new Error('Invalid project file')
  return {
    cal: json.calibration || { x1: null, x2: null, y1: null, y2: null },
    xScale: json.xScale || 'linear',
    curves: (json.curves || []).map(c => ({
      name: c.name,
      color: c.color,
      pts: c.pts || []
    })),
    nPoints: json.exportSettings?.nPoints ?? 121,
    xFrom: json.exportSettings?.xFrom ?? 2000,
    xTo: json.exportSettings?.xTo ?? 8000,
    smoothWindow: json.exportSettings?.smoothWindow ?? 0,
    imageDataUrl: json.imageDataUrl || null
  }
}

export function downloadJson(state, filename = 'curve-project.json') {
  const data = serializeProject(state)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
