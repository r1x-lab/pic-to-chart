import { useState, useEffect } from 'react'

// Local-state input: lets the user type freely (including '-', '3.', '-0.')
// and only propagates a parsed number to the parent when the value is valid.
// On blur, if the text is not a valid number it reverts to the last known value.
function NumInput({ value, onChange, placeholder, className }) {
  const [text, setText] = useState(value != null && !isNaN(value) ? String(value) : '')

  // Sync display when parent value changes from outside (e.g. pixel-pick sets it)
  useEffect(() => {
    if (value != null && !isNaN(value)) setText(String(value))
  }, [value])

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onChange={e => {
        const raw = e.target.value
        setText(raw)
        const n = parseFloat(raw)
        if (!isNaN(n)) onChange(n)
      }}
      onBlur={() => {
        const n = parseFloat(text)
        if (isNaN(n)) {
          // restore to last valid parent value
          setText(value != null && !isNaN(value) ? String(value) : '')
        } else {
          setText(String(n))
          onChange(n)
        }
      }}
      className={className}
    />
  )
}

export default function CalibrationPanel({
  cal,
  xScale,
  onSetXScale,
  onUpdateCalValue,
  onUpdateCalPixel,
  onStartCalPick,
  activePickMode
}) {
  const setCount = ['x1', 'x2', 'y1', 'y2'].filter(k => cal[k]).length

  const PxInput = ({ label, value, onChange }) => (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-gray-400 w-3 shrink-0">{label}</span>
      <input
        type="number"
        step="1"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="w-full px-1.5 py-0.5 text-xs font-mono border border-gray-200 rounded outline-none focus:border-blue-400 bg-gray-50"
      />
    </div>
  )

  const CalRow = ({ k1, k2 }) => (
    <div className="grid grid-cols-2 gap-2 mb-3">
      {[k1, k2].map(k => {
        const isX = k.startsWith('x')
        return (
          <div key={k} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-500 font-medium">{k.toUpperCase()} 值</label>
              {cal[k] && <span className="text-[10px] text-green-600">✓</span>}
            </div>
            <div className="flex gap-1">
              <NumInput
                value={cal[k]?.val}
                onChange={n => onUpdateCalValue(k, n)}
                placeholder={k === 'x1' ? '2000' : k === 'x2' ? '8000' : k === 'y1' ? '0' : '11'}
                className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
              <button
                onClick={() => onStartCalPick(k)}
                className={`px-2 py-1.5 text-xs rounded border shrink-0 ${
                  activePickMode === `cal-${k}`
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                點選
              </button>
            </div>

            {cal[k] && (
              <div
                className={`rounded p-1.5 space-y-1 border ${
                  isX ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'
                }`}
              >
                <div className={`text-[10px] font-medium mb-0.5 ${isX ? 'text-red-500' : 'text-blue-500'}`}>
                  像素位置
                </div>
                <PxInput
                  label="X"
                  value={Math.round(cal[k].px ?? 0)}
                  onChange={v => onUpdateCalPixel(k, 'px', v)}
                />
                <PxInput
                  label="Y"
                  value={Math.round(cal[k].py ?? 0)}
                  onChange={v => onUpdateCalPixel(k, 'py', v)}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">座標軸校準</h3>
        <span className={`text-xs px-2 py-0.5 rounded ${
          setCount === 4 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {setCount}/4 已校準
        </span>
      </div>

      <div className="mb-3">
        <label className="text-xs text-gray-500 font-medium block mb-1">X 軸刻度</label>
        <div className="flex gap-1">
          {[
            { k: 'linear', label: '線性' },
            { k: 'log',    label: '對數' }
          ].map(s => (
            <button
              key={s.k}
              onClick={() => onSetXScale(s.k)}
              className={`flex-1 px-2 py-1 text-xs rounded border ${
                xScale === s.k
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <CalRow k1="x1" k2="x2" />
      <CalRow k1="y1" k2="y2" />

      <p className="text-[11px] text-gray-500 leading-relaxed">
        先輸入數值（支援負數），再點「<span className="font-medium">點選</span>」並在圖上點擊對應位置。點擊後可在「像素位置」欄手動微調 X/Y 像素座標。
      </p>
    </div>
  )
}
