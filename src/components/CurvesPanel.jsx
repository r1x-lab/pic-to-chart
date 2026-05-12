export default function CurvesPanel({
  curves,
  activeCurveIdx,
  onSelectCurve,
  onAddCurve,
  onRemoveCurve,
  onUpdateCurve,
  onTrace,
  onClearPts,
  onPickColor,
  onFillGaps,
  tolerance,
  onSetTolerance,
  activePickMode,
  calibrationReady
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">曲線</h3>
        <button
          onClick={onAddCurve}
          className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50"
        >
          + 新增
        </button>
      </div>

      <div className="space-y-1.5 mb-3 max-h-44 overflow-y-auto">
        {curves.map((c, i) => (
          <div
            key={i}
            onClick={() => onSelectCurve(i)}
            className={`flex items-center gap-2 p-1.5 rounded border cursor-pointer ${
              i === activeCurveIdx
                ? 'bg-blue-50 border-blue-300'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={c.visible}
              onChange={e => {
                e.stopPropagation()
                onUpdateCurve(i, { visible: e.target.checked })
              }}
              onClick={e => e.stopPropagation()}
              className="w-3.5 h-3.5"
            />
            <input
              type="color"
              value={c.color}
              onChange={e => onUpdateCurve(i, { color: e.target.value })}
              onClick={e => e.stopPropagation()}
              className="w-6 h-6 rounded border-0 cursor-pointer p-0"
            />
            <input
              type="text"
              value={c.name}
              onChange={e => onUpdateCurve(i, { name: e.target.value })}
              onClick={e => e.stopPropagation()}
              className="flex-1 min-w-0 px-1.5 py-0.5 text-sm bg-transparent border-0 focus:bg-white focus:border focus:border-gray-300 rounded outline-none"
            />
            <span className="text-[10px] text-gray-400 min-w-[24px] text-right">
              {c.pts.length}
            </span>
            {curves.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); onRemoveCurve(i) }}
                className="text-gray-400 hover:text-red-500 text-sm px-1"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2 pt-3 border-t border-gray-100">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500 font-medium">顏色容差</label>
            <span className="text-xs font-mono text-gray-700">{tolerance}</span>
          </div>
          <input
            type="range"
            min="10"
            max="120"
            value={tolerance}
            onChange={e => onSetTolerance(parseInt(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={onPickColor}
            disabled={!calibrationReady}
            className={`px-2 py-1.5 text-xs rounded border ${
              activePickMode === 'pick-color'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            取色
          </button>
          <button
            onClick={onTrace}
            disabled={!calibrationReady}
            className="px-2 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            自動追蹤
          </button>
        </div>

        <button
          onClick={onFillGaps}
          disabled={!curves[activeCurveIdx]?.pts.length}
          className="w-full px-2 py-1.5 text-xs rounded border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed"
          title="在已追蹤的點之間，用插值補上缺漏的像素欄，讓每個位置都有可拖曳的點"
        >
          補全缺口點位
        </button>

        <button
          onClick={onClearPts}
          disabled={!curves[activeCurveIdx]?.pts.length}
          className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          清除目前曲線點位
        </button>
      </div>
    </div>
  )
}
