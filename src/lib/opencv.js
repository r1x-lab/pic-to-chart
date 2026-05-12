// Lazy load OpenCV.js (~8MB) only when user opts in
let cvLoading = null
let cvReady = false

export function loadOpenCV() {
  if (cvReady) return Promise.resolve(window.cv)
  if (cvLoading) return cvLoading

  cvLoading = new Promise((resolve, reject) => {
    if (window.cv && window.cv.Mat) {
      cvReady = true
      resolve(window.cv)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://docs.opencv.org/4.10.0/opencv.js'
    script.async = true
    script.onload = () => {
      // OpenCV.js loads in two phases; wait for runtime ready
      const check = () => {
        if (window.cv && window.cv.Mat) {
          cvReady = true
          resolve(window.cv)
        } else if (window.cv && typeof window.cv.then === 'function') {
          // Newer builds expose cv as a promise
          window.cv.then(c => {
            window.cv = c
            cvReady = true
            resolve(c)
          })
        } else {
          setTimeout(check, 100)
        }
      }
      check()
    }
    script.onerror = () => reject(new Error('OpenCV.js failed to load'))
    document.head.appendChild(script)
  })
  return cvLoading
}

// Advanced grid removal using OpenCV morphology
// Detects horizontal lines via long horizontal structuring element, then inpaints
export async function removeGridOpenCV(imgData) {
  const cv = await loadOpenCV()
  const src = cv.matFromImageData(imgData)
  const gray = new cv.Mat()
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

  // Threshold: keep dark/colored pixels, mask out near-white background
  const binary = new cv.Mat()
  cv.threshold(gray, binary, 230, 255, cv.THRESH_BINARY_INV)

  // Detect horizontal lines: morph open with long horizontal kernel
  const horizKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(40, 1))
  const horizLines = new cv.Mat()
  cv.morphologyEx(binary, horizLines, cv.MORPH_OPEN, horizKernel)

  // Dilate slightly to cover anti-aliasing
  const dilateK = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, 3))
  cv.dilate(horizLines, horizLines, dilateK)

  // Inpaint: use the line mask to remove grid from original
  const rgb = new cv.Mat()
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB)
  const inpainted = new cv.Mat()
  cv.inpaint(rgb, horizLines, inpainted, 3, cv.INPAINT_TELEA)

  // Convert back to RGBA ImageData
  const rgba = new cv.Mat()
  cv.cvtColor(inpainted, rgba, cv.COLOR_RGB2RGBA)
  const out = new ImageData(
    new Uint8ClampedArray(rgba.data),
    rgba.cols,
    rgba.rows
  )

  // Cleanup
  src.delete(); gray.delete(); binary.delete()
  horizKernel.delete(); horizLines.delete(); dilateK.delete()
  rgb.delete(); inpainted.delete(); rgba.delete()

  return out
}
