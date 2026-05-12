export default function ExportPanel({
  nPoints,
  xFrom,
  xTo,
  onSetNPoints,
  onSetXFrom,
  onSetXTo,
  onExportXlsx,
  onExportCsv,
  onSaveProject,
  onLoadProject,
  canExport
}) {
  const fileInputRef = (el) => {
    if (el) window.__projectFileInput = el
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">重新取樣並匯出</h3>

      <div className="space-y-2 mb-3">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">點數</label>
            <input
              type="number"
              value={nPoints}
              onChange={e => onSetNPoints(parseInt(e.target.value) || 2)}
              min="2"
              max="2001"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">X 起始</label>
            <input
              type="number"
              step="any"
              value={xFrom}
              onChange={e => onSetXFrom(parseFloat(e.target.value))}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">X 終止</label>
            <input
              type="number"
              step="any"
              value={xTo}
              onChange={e => onSetXTo(parseFloat(e.target.value))}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:border-blue-500 outline-none"
            />
          </div>
        </div>
        <div className="text-[10px] text-gray-500">
          間距：{((xTo - xFrom) / (nPoints - 1)).toFixed(2)} / 點
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={onExportXlsx}
          disabled={!canExport}
          className="px-2 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          匯出 xlsx
        </button>
        <button
          onClick={onExportCsv}
          disabled={!canExport}
          className="px-2 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          匯出 CSV
        </button>
      </div>

      <div className="pt-3 border-t border-gray-100">
        <div className="text-xs text-gray-500 font-medium mb-2">專案</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onSaveProject}
            className="px-2 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50"
          >
            儲存 JSON
          </button>
          <button
            onClick={() => window.__projectFileInput?.click()}
            className="px-2 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50"
          >
            載入 JSON
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={onLoadProject}
        />
      </div>
    </div>
  )
}
