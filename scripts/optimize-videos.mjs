#!/usr/bin/env node
/**
 * Re-encoda MP4s grandes em public/assets/ com configurações mais agressivas:
 *   - CRF 28 (vs 23 do default) — qualidade ainda boa para screencast
 *   - preset slow — melhor compressão
 *   - fps cap em 15 — screencasts não precisam mais
 *   - resize cap em 1280px — imagens maiores são desnecessárias para docs
 *
 * Mantém o original se o re-encode não for menor.
 *
 * Uso:
 *   node scripts/optimize-videos.mjs              # dry-run
 *   node scripts/optimize-videos.mjs --apply      # aplica
 *   node scripts/optimize-videos.mjs --apply --crf 30  # mais agressivo
 *   node scripts/optimize-videos.mjs --apply --threshold 1MB  # só MP4s > 1MB
 */

import { readdirSync, statSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'

const execFileP = promisify(execFile)

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ASSETS_DIR = resolve(ROOT, 'public', 'assets')

const APPLY = process.argv.includes('--apply')

const crfIdx = process.argv.indexOf('--crf')
const CRF = crfIdx >= 0 ? parseInt(process.argv[crfIdx + 1], 10) : 28

const thIdx = process.argv.indexOf('--threshold')
const THRESHOLD_STR = thIdx >= 0 ? process.argv[thIdx + 1] : '2MB'
const THRESHOLD = (() => {
  const m = THRESHOLD_STR.match(/^(\d+(?:\.\d+)?)(KB|MB|GB|B)?$/i)
  if (!m) return 2 * 1024 * 1024
  const n = parseFloat(m[1])
  const u = (m[2] || 'B').toUpperCase()
  return n * ({ B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 }[u])
})()

const FPS_CAP = 15
const SCALE_CAP = 1280

function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

async function reencode(input, output) {
  const args = [
    '-y',
    '-i', input,
    '-movflags', '+faststart',
    '-pix_fmt', 'yuv420p',
    '-vf', `scale='min(${SCALE_CAP},iw)':-2,fps=${FPS_CAP}`,
    '-c:v', 'libx264',
    '-crf', String(CRF),
    '-preset', 'slow',
    '-an',
    output
  ]
  await execFileP(ffmpegInstaller.path, args, { maxBuffer: 50 * 1024 * 1024 })
}

const files = readdirSync(ASSETS_DIR)
  .filter(f => /\.mp4$/i.test(f))
  .map(f => ({ name: f, path: join(ASSETS_DIR, f), size: statSync(join(ASSETS_DIR, f)).size }))
  .filter(f => f.size >= THRESHOLD)
  .sort((a, b) => b.size - a.size)

console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log(`CRF: ${CRF} | preset: slow | fps cap: ${FPS_CAP} | scale cap: ${SCALE_CAP}px`)
console.log(`Threshold: ${fmtBytes(THRESHOLD)}`)
console.log(`MP4s elegíveis: ${files.length}`)
console.log()

if (files.length === 0) {
  console.log('Nada a fazer.')
  process.exit(0)
}

let totalBefore = 0, totalAfter = 0, kept = 0, reverted = 0

for (let i = 0; i < files.length; i++) {
  const f = files[i]
  totalBefore += f.size
  process.stdout.write(`[${i + 1}/${files.length}] ${f.name} (${fmtBytes(f.size)}) ... `)

  if (!APPLY) {
    console.log('(dry-run)')
    totalAfter += f.size
    continue
  }

  const tmpOut = join(tmpdir(), `optvid-${process.pid}-${i}.mp4`)
  try {
    await reencode(f.path, tmpOut)
    const sz = statSync(tmpOut).size
    if (sz < f.size) {
      unlinkSync(f.path)
      renameSync(tmpOut, f.path)
      totalAfter += sz
      kept++
      console.log(`-> ${fmtBytes(sz)} (${(100 * sz / f.size).toFixed(1)}%)`)
    } else {
      try { unlinkSync(tmpOut) } catch {}
      totalAfter += f.size
      reverted++
      console.log(`SEM GANHO (${fmtBytes(sz)}) — original mantido`)
    }
  } catch (e) {
    totalAfter += f.size
    console.log(`FALHA: ${e.message.split('\n')[0]}`)
  }
}

console.log()
console.log(`Re-encodados:    ${kept}`)
console.log(`Sem ganho:       ${reverted}`)
console.log(`Antes:    ${fmtBytes(totalBefore)}`)
console.log(`Depois:   ${fmtBytes(totalAfter)}`)
const saved = totalBefore - totalAfter
console.log(`Economia: ${fmtBytes(saved)} (${(saved / totalBefore * 100).toFixed(1)}%)`)
