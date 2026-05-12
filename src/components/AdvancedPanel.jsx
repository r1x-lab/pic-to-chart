import { useState } from 'react'

export default function AdvancedPanel({
  onRemoveGridSimple,
  onResetImage,
  onRunOCR,
  ocrResults,
  ocrBusy,
  imageLoaded
}) {
  const [showOCR, setShowOCR] = useState(false)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">進階功能</h3>

      <div className="space-y-2 mb-3">
        <div className="text-xs text-gray-500 font-medium">格線移除</div>
        <button
          onClick={onRemoveGridSimple}
          disabled={!imageLoaded}
          className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
        >
          移除格線（簡易）
        </button>
        <button
          onClick={onResetImage}
          disabled={!imageLoaded}
          className="w-full px-2 py-1 text-[11px] rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
        >
          重設圖片
        </button>
      </div>

      <div className="pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-gray-500 font-medium">OCR 座標軸標籤</div>
          <button
            onClick={() => setShowOCR(!showOCR)}
            className="text-[10px] text-blue-600 hover:underline"
          >
            {showOCR ? '隱藏' : '顯示'}
          </button>
        </div>

        {showOCR && (
          <>
            <button
              onClick={onRunOCR}
              disabled={!imageLoaded || ocrBusy}
              className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 mb-2"
            >
              {ocrBusy ? 'OCR 執行中…' : '自動偵測刻度標籤'}
            </button>
            <p className="text-[10px] text-gray-500 leading-relaxed mb-2">
              掃描圖片底部 15% 和左側 12% 的數字標籤，首次執行需下載約 3MB。
            </p>
            {ocrResults && (
              <div className="max-h-24 overflow-y-auto bg-gray-50 rounded p-1.5 text-[10px] font-mono">
                {ocrResults.length === 0 ? (
                  <span className="text-gray-400">未偵測到標籤。</span>
                ) : (
                  ocrResults.map((r, i) => (
                    <div key={i}>
                      <span className="text-blue-700">{r.value}</span>
                      <span className="text-gray-400 ml-2">@ ({Math.round(r.bbox.x)}, {Math.round(r.bbox.y)})</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
