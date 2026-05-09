#!/usr/bin/env node
/**
 * Otimiza PNG e JPG em public/assets/ via sharp.
 *
 * Estratégia:
 *   - PNG: tenta palette (quantizado) e lossless; usa o menor.
 *          A versão palette só é aceita se reduzir 30%+ (típico de screenshots
 *          de UI sem gradientes complexos).
 *   - JPG: re-encode com mozjpeg, quality 82.
 *   - Só sobrescreve se o resultado for menor que o original.
 *
 * Uso:
 *   node scripts/optimize-images.mjs              # dry-run
 *   node scripts/optimize-images.mjs --apply      # sobrescreve arquivos
 *   node scripts/optimize-images.mjs --aggressive # aceita palette mesmo com
 *                                                   ganhos menores (10%+)
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ASSETS_DIR = resolve(ROOT, 'public', 'assets')

const APPLY = process.argv.includes('--apply')
const AGGRESSIVE = process.argv.includes('--aggressive')
const PALETTE_THRESHOLD = AGGRESSIVE ? 0.10 : 0.30
const CONCURRENCY = 8

function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

async function optimizePng(buf) {
  // Lossless: zlib level 9 + adaptive filtering
  const lossless = await sharp(buf, { animated: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
  // Palette quantizado (8-bit, lossy mas bom pra UI screenshots)
  let palette = null
  try {
    palette = await sharp(buf)
      .png({ palette: true, quality: 90, compressionLevel: 9 })
      .toBuffer()
  } catch { /* algumas imagens animadas falham com palette */ }

  // Decide qual usar
  if (palette && (buf.length - palette.length) / buf.length >= PALETTE_THRESHOLD &&
      palette.length < lossless.length) {
    return { buf: palette, mode: 'palette' }
  }
  return { buf: lossless, mode: 'lossless' }
}

async function optimizeJpg(buf) {
  const out = await sharp(buf)
    .jpeg({ quality: 82, mozjpeg: true, progressive: true })
    .toBuffer()
  return { buf: out, mode: 'jpeg' }
}

const allFiles = readdirSync(ASSETS_DIR)
const targets = allFiles.filter(f => /\.(png|jpe?g)$/i.test(f))
console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}${AGGRESSIVE ? ' (aggressive)' : ''}`)
console.log(`Imagens elegíveis: ${targets.length} (de ${allFiles.length} arquivos)`)
console.log()

let processed = 0, kept = 0, skipped = 0, errors = 0
let totalBefore = 0, totalAfter = 0
const modeCount = { palette: 0, lossless: 0, jpeg: 0 }
const topSavings = []

let idx = 0
async function worker() {
  while (true) {
    const i = idx++
    if (i >= targets.length) return
    const f = targets[i]
    const path = join(ASSETS_DIR, f)
    try {
      const orig = readFileSync(path)
      totalBefore += orig.length
      const ext = extname(f).toLowerCase()
      const { buf: opt, mode } = ext === '.png'
        ? await optimizePng(orig)
        : await optimizeJpg(orig)

      processed++
      if (opt.length < orig.length) {
        kept++
        modeCount[mode] = (modeCount[mode] || 0) + 1
        totalAfter += opt.length
        const saved = orig.length - opt.length
        topSavings.push({ f, before: orig.length, after: opt.length, saved, mode })
        if (APPLY) writeFileSync(path, opt)
      } else {
        skipped++
        totalAfter += orig.length
      }
    } catch (e) {
      errors++
      const orig = readFileSync(path)
      totalAfter += orig.length
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker))

topSavings.sort((a, b) => b.saved - a.saved)

console.log(`Processados: ${processed}`)
console.log(`Otimizados:  ${kept}`)
console.log(`Sem ganho:   ${skipped}`)
if (errors > 0) console.log(`Erros:       ${errors}`)
console.log()
console.log('Modos usados:')
for (const [m, c] of Object.entries(modeCount)) {
  if (c > 0) console.log(`  ${m.padEnd(10)} ${c}`)
}
console.log()
console.log(`Antes:    ${fmtBytes(totalBefore)}`)
console.log(`Depois:   ${fmtBytes(totalAfter)}`)
const saved = totalBefore - totalAfter
console.log(`Economia: ${fmtBytes(saved)} (${(saved / totalBefore * 100).toFixed(1)}%)`)
console.log()
console.log('Top 10 ganhos individuais:')
for (const s of topSavings.slice(0, 10)) {
  console.log(`  -${fmtBytes(s.saved).padStart(8)}  ${fmtBytes(s.before).padStart(8)} → ${fmtBytes(s.after).padStart(8)}  [${s.mode}]  ${s.f}`)
}

if (!APPLY) {
  console.log()
  console.log('[DRY-RUN] Nada gravado. Para aplicar:')
  console.log('  node scripts/optimize-images.mjs --apply')
  if (!AGGRESSIVE) {
    console.log('  node scripts/optimize-images.mjs --apply --aggressive  # mais ganho via palette')
  }
}
