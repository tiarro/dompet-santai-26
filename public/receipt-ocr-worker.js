// Keep the OCR API and its engine off the UI thread. Terminating this worker
// also disposes its child engine worker, including during initialization.
let started = false
let failed = false
function fail() {
  if (failed) return
  failed = true
  self.postMessage({ type: 'error' })
  self.close()
}

self.onmessage = async ({ data }) => {
  if (started || typeof data?.image !== 'string') return
  started = true
  let engine
  try {
    const assets = new URL('ocr/v7/', self.location.href).href
    importScripts(assets + 'tesseract.min.js')
    engine = await self.Tesseract.createWorker(['ind', 'eng'], 1, {
      workerPath: assets + 'worker.min.js',
      corePath: assets + 'core',
      langPath: assets + 'lang',
      workerBlobURL: false,
      cachePath: 'dompet-santai-ocr-v7',
      logger: message => self.postMessage({
        type: 'progress',
        stage: message.status === 'recognizing text' ? 'recognizing' : 'loading',
        percent: Math.round((message.progress || 0) * 100),
      }),
      errorHandler: fail,
    })
    await engine.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300' })
    const result = await engine.recognize(data.image)
    if (!failed) self.postMessage({ type: 'result', text: result.data.text })
  } catch {
    fail()
  } finally {
    if (engine) await engine.terminate()
    self.close()
  }
}
