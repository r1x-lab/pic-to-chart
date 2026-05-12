export default function EditPanel({
  brushRadius,
  onSetBrushRadius,
  weightKind,
  onSetWeightKind,
  smoothWindow,
  onSetSmoothWindow,
  onSmooth
}) {
  const presets = [1, 3, 10, 20, 50]

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">編輯與平滑</h3>

      <div className="mb-3">
        <label className="text-xs text-gray-500 font-medium block mb-1">權重函數</label>
        <div className="flex gap-1">
          {[
            { k: 'gaussian', label: '高斯' },
            { k: 'cosine',   label: '餘弦' }
          ].map(o => (
            <button
              key={o.k}
              onClick={() => onSetWeightKind(o.k)}
              className={`flex-1 px-2 py-1 text-xs rounded border ${
                weightKind === o.k
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500 font-medium">筆刷半徑（鄰近點）</label>
          <span className="text-xs font-mono text-gray-700">{brushRadius} 點</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={brushRadius}
          onChange={e => onSetBrushRadius(parseInt(e.target.value))}
          className="w-full"
        />
        <div className="flex gap-1 mt-1.5">
          {presets.map(p => (
            <button
              key={p}
              onClick={() => onSetBrushRadius(p)}
              className={`flex-1 px-1 py-0.5 text-[10px] rounded border ${
                brushRadius === p
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
          在預覽圖表上拖曳一個點 — 前後 ±{brushRadius} 個點會以 {weightKind === 'gaussian' ? '高斯' : '餘弦'} 衰減跟隨移動。
        </p>
      </div>

      <div className="pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500 font-medium">Savitzky-Golay 視窗</label>
          <span className="text-xs font-mono text-gray-700">{smoothWindow || '關閉'}</span>
        </div>
        <input
          type="range"
          min="0"
          max="21"
          step="2"
          value={smoothWindow}
          onChange={e => onSetSmoothWindow(parseInt(e.target.value))}
          className="w-full"
        />
        <button
          onClick={onSmooth}
          disabled={!smoothWindow}
          className="w-full mt-2 px-2 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          套用平滑至目前曲線
        </button>
      </div>
    </div>
  )
}
