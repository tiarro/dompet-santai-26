import { createRequire } from 'node:module'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))
const target = join(root, 'public', 'ocr', 'v7')
const tesseract = dirname(require.resolve('tesseract.js/package.json'))
const core = dirname(require.resolve('tesseract.js-core/package.json'))

async function copy(source, destination) {
  const bytes = await readFile(source)
  try { if (bytes.equals(await readFile(destination))) return } catch (error) { if (error.code !== 'ENOENT') throw error }
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, bytes)
}

for (const name of ['tesseract.min.js', 'tesseract.min.js.LICENSE.txt', 'worker.min.js', 'worker.min.js.LICENSE.txt']) {
  await copy(join(tesseract, 'dist', name), join(target, name))
}
await copy(join(tesseract, 'LICENSE.md'), join(target, 'TESSERACT-LICENSE.md'))
for (const name of await readdir(core)) {
  // Include all SIMD/LSTM variants so Tesseract can choose a compatible core.
  if (/^tesseract-core.*\.wasm(?:\.js)?$/.test(name)) await copy(join(core, name), join(target, 'core', name))
}
await copy(join(core, 'LICENSE'), join(target, 'core', 'LICENSE'))
for (const language of ['eng', 'ind']) {
  const directory = dirname(require.resolve(`@tesseract.js-data/${language}/package.json`))
  await copy(join(directory, '4.0.0_best_int', `${language}.traineddata.gz`), join(target, 'lang', `${language}.traineddata.gz`))
}
console.log('Aset OCR lokal siap di public/ocr/v7 (Tesseract.js 7, eng + ind).')
