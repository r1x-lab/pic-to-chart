import { useState, useRef, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx'
import ImageCanvas from './components/ImageCanvas'
import PreviewChart from './components/PreviewChart'
import CalibrationPanel from './components/CalibrationPanel'
import CurvesPanel from './components/CurvesPanel'
import EditPanel from './components/EditPanel'
import ExportPanel from './components/ExportPanel'
import AdvancedPanel from './components/AdvancedPanel'
import { makeTransform, isCalibrationComplete } from './lib/transform'
import { traceCurve, fillGaps, extendToRange, removeOutliers, removeGridLines, sampleColor, rgbToHex } from './lib/image'
import { ocrStrip } from './lib/ocr'
import { pchipInterp, savitzkyGolay } from './lib/math'
import { downloadJson, deserializeProject } from './lib/project'
import { addChartToXlsx } from './lib/xlsx-chart'

const DEFAULT_COLORS = ['#e6d200', '#666666', '#dc2626', '#2563eb', '#16a34a', '#9333ea']

function makeDefaultCurve(idx) {
  return {
    name: `Curve ${idx + 1}`,
    color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
    pts: [],
    visible: true
  }
}

export default function App() {
  // Image state
  const [imgEl, setImgEl] = useState(null)
  const [imgData, setImgData] = useState(null)        // current displayed (may be processed)
  const [origImgData, setOrigImgData] = useState(null) // backup of original
  const [imgDataUrl, setImgDataUrl] = useState(null)

  // Calibration
  const [cal, setCal] = useState({ x1: null, x2: null, y1: null, y2: null })
  const [xScale, setXScale] = useState('linear')

  // Curves
  const [curves, setCurves] = useState([makeDefaultCurve(0), makeDefaultCurve(1)])
  const [activeCurveIdx, setActiveCurveIdx] = useState(0)
  const [tolerance, setTolerance] = useState(55)

  // Undo history — each entry is a deep copy of curves at a point in time
  const [history, setHistory] = useState([])
  const canUndo = history.length > 0

  // Edit
  const [brushRadius, setBrushRadius] = useState(5)
  const [weightKind, setWeightKind] = useState('gaussian')
  const [smoothWindow, setSmoothWindow] = useState(0)

  // Export
  const [nPoints, setNPoints] = useState(121)
  const [xFrom, setXFrom] = useState(2000)
  const [xTo, setXTo] = useState(8000)

  // UI state
  const [pickMode, setPickMode] = useState(null) // 'cal-x1' | 'pick-color' | etc.
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrResults, setOcrResults] = useState(null)

  const fileInputRef = useRef(null)
  // Always-current ref so pushHistory can snapshot without needing curves as a dep
  const curvesRef = useRef(curves)
  curvesRef.current = curves

  const calibrationReady = isCalibrationComplete(cal)

  // ---------- Image loading ----------
  const loadImageFromFile = (file) => {
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target.result
      const img = new Image()
      img.onload = () => {
        // Scale: upscale small images to at least 1000px wide for click precision,
        // downscale huge images to 1400px max to keep performance reasonable.
        const minW = 1000
        const maxW = 1400
        const scale = Math.max(minW / img.width, Math.min(1, maxW / img.width))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)

        // Pre-render to extract ImageData
        const cv = document.createElement('canvas')
        cv.width = w
        cv.height = h
        const ctx = cv.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        const data = ctx.getImageData(0, 0, w, h)

        // Create a scaled image element to keep displayed size consistent
        const scaledImg = new Image()
        scaledImg.onload = () => {
          setImgEl(scaledImg)
          setImgData(data)
          setOrigImgData(new ImageData(new Uint8ClampedArray(data.data), w, h))
          setImgDataUrl(cv.toDataURL('image/png'))
        }
        scaledImg.src = cv.toDataURL('image/png')
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  const onFileChange = (e) => {
    const f = e.target.files?.[0]
    if (f) loadImageFromFile(f)
  }

  // ---------- Calibration ----------
  const startCalPick = (k) => setPickMode(`cal-${k}`)
  const updateCalValue = (k, val) => {
    setCal(prev => ({ ...prev, [k]: { ...(prev[k] || {}), val } }))
  }
  const updateCalPixel = (k, field, val) => {
    setCal(prev => ({ ...prev, [k]: { ...(prev[k] || {}), [field]: parseFloat(val) || 0 } }))
  }
  const handleCanvasClick = (x, y) => {
    if (pickMode?.startsWith('cal-')) {
      const k = pickMode.replace('cal-', '')
      const defaultVals = { x1: 2000, x2: 8000, y1: 0, y2: 11 }
      setCal(prev => ({
        ...prev,
        [k]: { px: x, py: y, val: prev[k]?.val ?? defaultVals[k] }
      }))
      setPickMode(null)
    } else if (pickMode === 'pick-color') {
      if (!imgData) return
      const [r, g, b] = sampleColor(imgData, imgData.width, Math.round(x), Math.round(y), 2)
      const hex = rgbToHex(r, g, b)
      updateCurve(activeCurveIdx, { color: hex })
      setPickMode(null)
    }
  }

  // ---------- Curves ----------
  const selectCurve = (i) => setActiveCurveIdx(i)
  const addCurve = () => {
    setCurves([...curves, makeDefaultCurve(curves.length)])
    setActiveCurveIdx(curves.length)
  }
  const removeCurve = (i) => {
    if (curves.length <= 1) return
    const next = curves.filter((_, idx) => idx !== i)
    setCurves(next)
    if (activeCurveIdx >= next.length) setActiveCurveIdx(next.length - 1)
  }
  const updateCurve = (i, patch) => {
    setCurves(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c))
  }
  // Save current curves snapshot to history (max 50 steps).
  // Uses curvesRef so the callback never needs curves as a dep.
  const pushHistory = useCallback(() => {
    setHistory(h => [
      ...h.slice(-49),
      curvesRef.current.map(c => ({
        ...c,
        pts: c.pts.map(p => ({ ...p })),
        origPts: c.origPts?.map(p => ({ ...p }))
      }))
    ])
  }, [])

  const undo = useCallback(() => {
    setHistory(h => {
      if (!h.length) return h
      const restored = h[h.length - 1]
      setCurves(restored)          // batched with setHistory by React 18
      return h.slice(0, -1)
    })
  }, [])

  // Keyboard shortcut — must be declared after undo to avoid TDZ
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo])

  // When calibration or scale changes, recompute x/y for all stored pts
  // so PreviewChart and export always reflect the current transform.
  useEffect(() => {
    if (!isCalibrationComplete(cal)) return
    const t = makeTransform(cal, xScale)
    setCurves(prev => prev.map(c => ({
      ...c,
      pts: c.pts.map(p => ({ ...p, x: t.pxToX(p.px), y: t.pxToY(p.py) })),
      origPts: c.origPts?.map(p => ({ ...p, x: t.pxToX(p.px), y: t.pxToY(p.py) }))
    })))
  }, [cal, xScale])

  const updateCurvePts = useCallback((i, pts) => {
    setCurves(prev => prev.map((c, idx) => idx === i ? { ...c, pts } : c))
  }, [])

  const traceActive = () => {
    if (!imgData || !calibrationReady) return
    pushHistory()
    const t = makeTransform(cal, xScale)
    const xMin = Math.min(cal.x1.px, cal.x2.px)
    const xMax = Math.max(cal.x1.px, cal.x2.px)
    const yMin = Math.min(cal.y1.py, cal.y2.py)
    const yMax = Math.max(cal.y1.py, cal.y2.py)
    const c = curves[activeCurveIdx]
    const raw = traceCurve(imgData, imgData.width, imgData.height, c.color, tolerance,
      { xMin, xMax, yMin, yMax }, t)
    const cleaned = removeOutliers(raw)
    const extended = extendToRange(cleaned, xMin, xMax, t)
    const pts = fillGaps(extended)
    // origPts keeps the auto-trace snapshot for ghost overlay reference
    updateCurve(activeCurveIdx, { pts, origPts: pts.map(p => ({ ...p })) })
  }

  const clearActivePts = () => { pushHistory(); updateCurve(activeCurveIdx, { pts: [] }) }

  const fillActivePtsGaps = () => {
    const c = curves[activeCurveIdx]
    if (!c.pts.length) return
    pushHistory()
    const filled = fillGaps(c.pts)
    updateCurve(activeCurveIdx, {
      pts: filled,
      origPts: c.origPts ?? filled.map(p => ({ ...p }))
    })
  }

  // ---------- Smoothing ----------
  const applySmoothing = () => {
    const c = curves[activeCurveIdx]
    if (!c.pts.length || !smoothWindow) return
    pushHistory()
    const sorted = [...c.pts].sort((a, b) => a.x - b.x)
    const ys = sorted.map(p => p.y)
    const smoothed = savitzkyGolay(ys, smoothWindow)
    const newPts = sorted.map((p, i) => ({ ...p, y: smoothed[i] }))
    updateCurve(activeCurveIdx, { pts: newPts })
  }

  // ---------- Grid removal ----------
  const doRemoveGridSimple = () => {
    if (!imgData) return
    const cleaned = removeGridLines(imgData, imgData.width, imgData.height)
    setImgData(cleaned)
  }
  const resetImage = () => {
    if (origImgData) {
      setImgData(new ImageData(new Uint8ClampedArray(origImgData.data), origImgData.width, origImgData.height))
    }
  }

  // ---------- OCR ----------
  const runOCR = async () => {
    if (!imgEl || !imgData) return
    setOcrBusy(true)
    setOcrResults(null)
    try {
      const cv = document.createElement('canvas')
      cv.width = imgData.width
      cv.height = imgData.height
      cv.getContext('2d').putImageData(imgData, 0, 0)
      // Run on bottom strip (x labels) and left strip (y labels)
      const bottom = await ocrStrip(cv, 0, Math.floor(cv.height * 0.85), cv.width, Math.floor(cv.height * 0.15))
      const left = await ocrStrip(cv, 0, 0, Math.floor(cv.width * 0.12), cv.height)
      const all = [...bottom, ...left]
      setOcrResults(all)
    } catch (err) {
      alert('OCR failed: ' + err.message)
    } finally {
      setOcrBusy(false)
    }
  }

  // ---------- Export ----------
  const buildExportRows = () => {
    const xNew = []
    for (let i = 0; i < nPoints; i++) {
      xNew.push(xFrom + ((xTo - xFrom) * i) / (nPoints - 1))
    }
    const cols = curves.filter(c => c.pts.length > 0).map(c => {
      const sorted = [...c.pts].sort((a, b) => a.x - b.x)
      const xs = sorted.map(p => p.x)
      const ys = sorted.map(p => p.y)
      return { name: c.name, ys: pchipInterp(xs, ys, xNew) }
    })
    const header = ['X', ...cols.map(c => c.name)]
    const rows = [header]
    for (let i = 0; i < nPoints; i++) {
      rows.push([
        round3(xNew[i]),
        ...cols.map(c => c.ys[i] != null ? round3(c.ys[i]) : '')
      ])
    }
    return rows
  }
  const round3 = (n) => Math.round(n * 1000) / 1000

  const canExport = curves.some(c => c.pts.length >= 2)

  const exportXlsx = async () => {
    if (!canExport) return
    const rows = buildExportRows()
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'curves')

    const xlsxArray = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const seriesNames = curves.filter(c => c.pts.length > 0).map(c => c.name)
    const withChart = await addChartToXlsx(xlsxArray, seriesNames, nPoints)

    const blob = new Blob([withChart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'curve_data.xlsx'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const exportCsv = () => {
    if (!canExport) return
    const rows = buildExportRows()
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'curve_data.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // ---------- Project save/load ----------
  const saveProject = () => {
    downloadJson({
      cal, xScale, curves, nPoints, xFrom, xTo, smoothWindow,
      imageDataUrl: imgDataUrl
    })
  }
  const loadProject = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = deserializeProject(JSON.parse(ev.target.result))
        setCal(parsed.cal)
        setXScale(parsed.xScale)
        setCurves(parsed.curves.length ? parsed.curves.map(c => ({ ...c, visible: true })) : [makeDefaultCurve(0)])
        setNPoints(parsed.nPoints)
        setXFrom(parsed.xFrom)
        setXTo(parsed.xTo)
        setSmoothWindow(parsed.smoothWindow)
        if (parsed.imageDataUrl) {
          const img = new Image()
          img.onload = () => {
            const cv = document.createElement('canvas')
            cv.width = img.width
            cv.height = img.height
            const ctx = cv.getContext('2d')
            ctx.drawImage(img, 0, 0)
            const d = ctx.getImageData(0, 0, img.width, img.height)
            setImgEl(img)
            setImgData(d)
            setOrigImgData(new ImageData(new Uint8ClampedArray(d.data), img.width, img.height))
            setImgDataUrl(parsed.imageDataUrl)
          }
          img.src = parsed.imageDataUrl
        }
      } catch (err) {
        alert('Failed to load project: ' + err.message)
      }
    }
    reader.readAsText(f)
    e.target.value = ''
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold">曲線數據擷取工具</h1>
            <p className="text-xs text-gray-500">像素追蹤、精修，並匯出為 xlsx / CSV</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              {imgEl ? '更換圖片' : '上傳圖片'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-4 grid grid-cols-12 gap-4">
        {/* Left: image + preview */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          <ImageCanvas
            imgEl={imgEl}
            imgData={imgData}
            cal={cal}
            xScale={xScale}
            curves={curves}
            activeCurveIdx={activeCurveIdx}
            onCanvasClick={handleCanvasClick}
            onUpdateCurve={updateCurvePts}
            onDragStart={pushHistory}
            onUndo={undo}
            canUndo={canUndo}
            brushRadius={brushRadius}
            weightKind={weightKind}
            cursorMode={pickMode}
          />
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">資料空間預覽</h2>
              <div className="text-xs text-gray-500">
                拖曳請在上方圖片上操作
              </div>
            </div>
            <PreviewChart
              curves={curves}
              activeCurveIdx={activeCurveIdx}
              xRange={{ xFrom, xTo }}
            />
          </div>
        </div>

        {/* Right: control panels */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <CalibrationPanel
            cal={cal}
            xScale={xScale}
            onSetXScale={setXScale}
            onUpdateCalValue={updateCalValue}
            onUpdateCalPixel={updateCalPixel}
            onStartCalPick={startCalPick}
            activePickMode={pickMode}
          />
          <CurvesPanel
            curves={curves}
            activeCurveIdx={activeCurveIdx}
            onSelectCurve={selectCurve}
            onAddCurve={addCurve}
            onRemoveCurve={removeCurve}
            onUpdateCurve={updateCurve}
            onTrace={traceActive}
            onClearPts={clearActivePts}
            onFillGaps={fillActivePtsGaps}
            onPickColor={() => setPickMode('pick-color')}
            tolerance={tolerance}
            onSetTolerance={setTolerance}
            activePickMode={pickMode}
            calibrationReady={calibrationReady}
          />
          <EditPanel
            brushRadius={brushRadius}
            onSetBrushRadius={setBrushRadius}
            weightKind={weightKind}
            onSetWeightKind={setWeightKind}
            smoothWindow={smoothWindow}
            onSetSmoothWindow={setSmoothWindow}
            onSmooth={applySmoothing}
          />
          <AdvancedPanel
            onRemoveGridSimple={doRemoveGridSimple}
            onResetImage={resetImage}
            onRunOCR={runOCR}
            ocrResults={ocrResults}
            ocrBusy={ocrBusy}
            imageLoaded={!!imgEl}
          />
          <ExportPanel
            nPoints={nPoints}
            xFrom={xFrom}
            xTo={xTo}
            onSetNPoints={setNPoints}
            onSetXFrom={setXFrom}
            onSetXTo={setXTo}
            onExportXlsx={exportXlsx}
            onExportCsv={exportCsv}
            onSaveProject={saveProject}
            onLoadProject={loadProject}
            canExport={canExport}
          />
        </div>
      </main>

      <footer className="text-center text-xs text-gray-400 py-4">
        使用 Vite + React + Tailwind 建置 · PCHIP 插值 · Savitzky-Golay 平滑
      </footer>
    </div>
  )
}
