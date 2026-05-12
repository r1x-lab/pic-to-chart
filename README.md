# Curve to Raw Data Extractor

從圖表影像反推 raw data，匯出 xlsx / CSV。專為 RF / 天線測試圖、量測曲線等情境設計。

## Features

- **半自動曲線追蹤**：點擊取色 → 自動沿 X 軸掃描，建立資料點
- **連動拖曳編輯**：拖一點，鄰近 1~100 點以高斯或餘弦窗加權跟隨
- **動態多曲線**：不限數量，每條獨立顏色、可見性、命名
- **校正**：4 點校正 X/Y 軸，支援 linear / log X 軸
- **平滑**：Savitzky-Golay 濾波（window 5~21）
- **進階影像處理**：
  - 簡易網格線移除（水平灰線偵測）
  - OpenCV.js 形態學 + inpainting 移除（lazy load 8MB）
- **OCR 軸標籤**：Tesseract.js 自動讀刻度數字（lazy load）
- **PCHIP 插值**：單調三次 Hermite，避免 cubic spline 在峰谷處 overshoot
- **專案存載**：完整狀態（影像 + 校正 + 曲線 + 設定）存成 JSON
- **匯出**：xlsx（SheetJS）/ CSV

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle to dist/
```

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

或推到 GitHub 後在 vercel.com 連結 repo，框架選 Vite，build command `npm run build`，output `dist`。

## 使用流程

1. **Upload image** — 上傳曲線圖（PNG / JPG）
2. **Calibrate** — 在右側校正面板填入 X1/X2/Y1/Y2 的真實數值 → 按 Pick → 點圖上對應位置（4 次）
3. **Pick curve color** — 按「Pick color」→ 點圖上曲線取色
4. **Auto trace** — 按下後沿 X 軸掃描，生成資料點
5. **Edit in preview** — 在下方預覽圖拖曳任一點，鄰近點依設定的權重函數連動
   - Gaussian：平滑、邊緣自然漸弱
   - Cosine：邊緣剛好為零，影響範圍精準可控
   - Brush radius 滑桿 0~100 點，或用 1/3/10/20/50 快速鈕
6. **Smooth** (optional) — Savitzky-Golay 平滑滑桿
7. **Resample & export** — 設定點數與 X 範圍 → Export xlsx

## 進階功能

- **Grid removal**：曲線顏色跟網格線太接近時，先移除網格再 trace 會穩很多
- **OCR**：自動偵測軸標籤位置與數值（非必要，校正時也可手動輸入）
- **Project save**：完整狀態存成 JSON，重啟後 Load 即可繼續

## 架構

```
src/
├─ App.jsx                  # 主元件，整合所有 state
├─ components/
│  ├─ ImageCanvas.jsx       # 影像顯示 + 校正點互動
│  ├─ PreviewChart.jsx      # 預覽圖 + 連動拖曳引擎
│  ├─ CalibrationPanel.jsx  # 軸校正面板
│  ├─ CurvesPanel.jsx       # 曲線列表
│  ├─ EditPanel.jsx         # 連動 + 平滑設定
│  ├─ ExportPanel.jsx       # 匯出 + 專案存載
│  └─ AdvancedPanel.jsx     # OpenCV / OCR
├─ lib/
│  ├─ math.js               # PCHIP, Savitzky-Golay, 權重函數
│  ├─ transform.js          # px ↔ data 座標轉換 (linear/log)
│  ├─ image.js              # 色彩匹配、曲線追蹤、簡易去網格
│  ├─ opencv.js             # OpenCV.js lazy loader + 形態學去網格
│  ├─ ocr.js                # Tesseract.js lazy loader
│  └─ project.js            # JSON 序列化
└─ index.css                # Tailwind + custom slider
```

## 已知限制

- OpenCV.js 首次載入 ~8MB（從 CDN），第二次走快取
- Tesseract OCR 對小字、雜訊背景準確度有限
- 大圖（>1200px 寬）會自動縮放至 1200px 以維持效能
- 連動拖曳的「鄰近」是基於 sorted index，假設曲線沿 X 單調採樣（auto trace 出來的都符合）

## License

MIT
