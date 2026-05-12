// Lazy load Tesseract for OCR axis tick labels
let workerPromise = null

async function getWorker() {
  if (workerPromise) return workerPromise
  workerPromise = (async () => {
    const Tesseract = await import('tesseract.js')
    const worker = await Tesseract.createWorker('eng', 1, {
      // CDN paths so we don't bundle the data
    })
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789.-',
      tessedit_pageseg_mode: '7' // single line
    })
    return worker
  })()
  return workerPromise
}

// Run OCR on a strip of the image (axis label area)
// Returns array of { text, value, bbox }
export async function ocrStrip(canvas, x, y, w, h) {
  const worker = await getWorker()
  // Create a cropped canvas for OCR
  const crop = document.createElement('canvas')
  crop.width = w
  crop.height = h
  const cctx = crop.getContext('2d')
  cctx.drawImage(canvas, x, y, w, h, 0, 0, w, h)

  const { data } = await worker.recognize(crop)
  const results = []
  if (data.words) {
    for (const word of data.words) {
      const txt = word.text.trim()
      const val = parseFloat(txt)
      if (!isNaN(val) && txt.match(/^-?\d+(\.\d+)?$/)) {
        results.push({
          text: txt,
          value: val,
          bbox: {
            x: x + word.bbox.x0,
            y: y + word.bbox.y0,
            w: word.bbox.x1 - word.bbox.x0,
            h: word.bbox.y1 - word.bbox.y0
          }
        })
      }
    }
  }
  return results
}

export async function terminateOcr() {
  if (workerPromise) {
    const w = await workerPromise
    await w.terminate()
    workerPromise = null
  }
}
