#!/usr/bin/env node
/**
 * Gera o pacote de favicons a partir de uma imagem fonte.
 *
 * Entrada padrão: public/assets/favicon.jpg
 * Saídas em public/:
 *   favicon.ico             (multi-tamanho 16/32/48)
 *   favicon-16x16.png
 *   favicon-32x32.png
 *   favicon-96x96.png
 *   apple-touch-icon.png    (180x180, iOS)
 *   android-chrome-192.png
 *   android-chrome-512.png
 *
 * Uso:
 *   node scripts/generate-favicons.mjs
 *   node scripts/generate-favicons.mjs --source public/assets/outra.png
 */

import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const sourceArgIndex = process.argv.indexOf('--source')
const SOURCE = sourceArgIndex >= 0
  ? resolve(ROOT, process.argv[sourceArgIndex + 1])
  : resolve(ROOT, 'public', 'assets', 'favicon.jpg')

const PUBLIC = resolve(ROOT, 'public')

const PNG_SIZES = [
  { size: 16,  name: 'favicon-16x16.png' },
  { size: 32,  name: 'favicon-32x32.png' },
  { size: 96,  name: 'favicon-96x96.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'android-chrome-192.png' },
  { size: 512, name: 'android-chrome-512.png' }
]

const ICO_SIZES = [16, 32, 48]

function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

console.log(`Fonte: ${SOURCE}`)
console.log(`Tamanho original: ${fmtBytes(statSync(SOURCE).size)}`)
console.log()

const sourceBuffer = readFileSync(SOURCE)
const meta = await sharp(sourceBuffer).metadata()
console.log(`Imagem fonte: ${meta.width}x${meta.height} ${meta.format}`)
if (meta.width !== meta.height) {
  console.log(`  AVISO: imagem não é quadrada — será cortada no centro`)
}
console.log()

const square = sharp(sourceBuffer).resize({
  width: Math.min(meta.width, meta.height),
  height: Math.min(meta.width, meta.height),
  fit: 'cover',
  position: 'center'
})
const squareBuffer = await square.png().toBuffer()

console.log('Gerando PNGs:')
const pngBuffers = {}
for (const { size, name } of PNG_SIZES) {
  const buf = await sharp(squareBuffer)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toBuffer()
  const out = resolve(PUBLIC, name)
  writeFileSync(out, buf)
  console.log(`  ${name.padEnd(28)} ${`${size}x${size}`.padEnd(9)} ${fmtBytes(buf.length)}`)
  pngBuffers[size] = buf
}

console.log()
console.log('Gerando .ico multi-tamanho:')
const icoSourceBuffers = []
for (const size of ICO_SIZES) {
  if (pngBuffers[size]) {
    icoSourceBuffers.push(pngBuffers[size])
  } else {
    const buf = await sharp(squareBuffer)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toBuffer()
    icoSourceBuffers.push(buf)
  }
}
const icoBuffer = await pngToIco(icoSourceBuffers)
const icoPath = resolve(PUBLIC, 'favicon.ico')
writeFileSync(icoPath, icoBuffer)
console.log(`  favicon.ico                  ${ICO_SIZES.join(',')}        ${fmtBytes(icoBuffer.length)}`)

console.log()
console.log('Pronto. Atualize o head em .vitepress/config.mts para apontar para os novos arquivos.')
