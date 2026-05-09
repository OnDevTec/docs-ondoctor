#!/usr/bin/env node
/**
 * Converte todos os .gif em public/assets/ para .mp4 (H.264) e atualiza refs nos .md.
 *
 * - .gif vira .mp4 com autoplay/loop/muted/playsinline (comportamento idêntico ao GIF)
 * - tags <img src="...gif"> e ![](...gif) viram <video> embutido
 * - Os .gif originais são deletados ao final
 *
 * Uso:
 *   node scripts/convert-gifs-to-mp4.mjs              # dry-run (mostra plano)
 *   node scripts/convert-gifs-to-mp4.mjs --apply      # converte de verdade
 *   node scripts/convert-gifs-to-mp4.mjs --apply --keep-gif   # mantém os .gif
 */

import {
  readdirSync, statSync, readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync
} from 'node:fs'
import { dirname, resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'

const execFileP = promisify(execFile)

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ASSETS_DIR = resolve(ROOT, 'public', 'assets')
const MAPPING_PATH = resolve(ROOT, '.vitepress', 'assets-renames.json')

const APPLY = process.argv.includes('--apply')
const KEEP_GIF = process.argv.includes('--keep-gif')
const SKIP_DIRS = new Set(['node_modules', '.vitepress', 'public', 'scripts', 'dist'])

function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function encodeAsset(name) {
  let decoded
  try { decoded = decodeURIComponent(name) } catch { decoded = name }
  return encodeURIComponent(decoded).replace(/\(/g, '%28').replace(/\)/g, '%29')
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function walkMd(dir, files = []) {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.') || SKIP_DIRS.has(e)) continue
    const full = join(dir, e)
    const st = statSync(full)
    if (st.isDirectory()) walkMd(full, files)
    else if (st.isFile() && e.toLowerCase().endsWith('.md')) files.push(full)
  }
  return files
}

async function convertGifToMp4(input, output) {
  const args = [
    '-y',
    '-i', input,
    '-movflags', '+faststart',
    '-pix_fmt', 'yuv420p',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v', 'libx264',
    '-crf', '23',
    '-preset', 'medium',
    '-an',
    output
  ]
  await execFileP(ffmpegInstaller.path, args, { maxBuffer: 50 * 1024 * 1024 })
}

const gifs = readdirSync(ASSETS_DIR)
  .filter(f => /\.gif$/i.test(f))
  .filter(f => statSync(join(ASSETS_DIR, f)).isFile())

console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log(`ffmpeg: ${ffmpegInstaller.path}`)
console.log(`GIFs encontrados: ${gifs.length}`)
console.log()

if (gifs.length === 0) {
  console.log('Nada a fazer.')
  process.exit(0)
}

if (!APPLY) {
  let total = 0
  for (const f of gifs) {
    const sz = statSync(join(ASSETS_DIR, f)).size
    total += sz
    console.log(`  ${fmtBytes(sz).padStart(10)}  ${f}`)
  }
  console.log()
  console.log(`Tamanho total dos GIFs: ${fmtBytes(total)}`)
  console.log('Estimativa pós-conversão: ~5-15% do tamanho original')
  console.log()
  console.log('Para aplicar:')
  console.log('  node scripts/convert-gifs-to-mp4.mjs --apply')
  process.exit(0)
}

// APPLY mode
let totalBefore = 0, totalAfter = 0
const successful = []
const failed = []

for (let i = 0; i < gifs.length; i++) {
  const gif = gifs[i]
  const gifPath = join(ASSETS_DIR, gif)
  const mp4 = gif.replace(/\.gif$/i, '.mp4')
  const mp4Path = join(ASSETS_DIR, mp4)
  const sizeBefore = statSync(gifPath).size
  totalBefore += sizeBefore

  process.stdout.write(`[${i + 1}/${gifs.length}] ${gif} (${fmtBytes(sizeBefore)})... `)

  try {
    await convertGifToMp4(gifPath, mp4Path)
    const sizeAfter = statSync(mp4Path).size
    totalAfter += sizeAfter
    const pct = (100 * sizeAfter / sizeBefore).toFixed(1)
    console.log(`-> ${mp4} (${fmtBytes(sizeAfter)}, ${pct}%)`)
    successful.push({ gif, mp4, sizeBefore, sizeAfter })
  } catch (e) {
    console.log(`FALHA: ${e.message.split('\n')[0]}`)
    failed.push({ gif, error: e.message })
  }
}

console.log()
console.log(`Convertidos: ${successful.length}`)
if (failed.length > 0) console.log(`Falhas: ${failed.length}`)
console.log(`Antes:    ${fmtBytes(totalBefore)}`)
console.log(`Depois:   ${fmtBytes(totalAfter)}`)
const saved = totalBefore - totalAfter
console.log(`Economia: ${fmtBytes(saved)} (${(saved / totalBefore * 100).toFixed(1)}%)`)
console.log()

// Reescreve refs nos .md
const mdFiles = walkMd(ROOT)
const renamesEnc = successful.map(s => [encodeAsset(s.gif), encodeAsset(s.mp4)])
const lookupRename = new Map(renamesEnc)
const renameRe = renamesEnc.length > 0
  ? new RegExp(`/assets/(${renamesEnc.map(([f]) => escapeRe(f)).join('|')})`, 'g')
  : null

let mdChanged = 0, refsRewritten = 0, tagsConverted = 0

// 1. Reescreve <img ...src="...gif"...> para <video ...> (apenas para gifs convertidos)
const gifNamesEsc = successful.map(s => escapeRe(encodeAsset(s.gif))).join('|')
const imgGifRe = new RegExp(
  `<img\\b[^>]*\\bsrc=("|')(/assets/(?:${gifNamesEsc}))\\1[^>]*?/?>`,
  'gi'
)

// 2. Reescreve ![alt](path.gif) para <video>
const mdImgGifRe = new RegExp(
  `!\\[([^\\]]*)\\]\\(/assets/(${gifNamesEsc})\\)`,
  'g'
)

for (const md of mdFiles) {
  let content = readFileSync(md, 'utf8')
  let changed = false

  // <img ...src=".gif"> -> <video ...>
  content = content.replace(imgGifRe, (full, _q, src) => {
    changed = true
    tagsConverted++
    const newSrc = src.replace(/\.gif$/i, '.mp4')
    return `<video src="${newSrc}" autoplay loop muted playsinline></video>`
  })

  // ![alt](.gif) -> <video>
  content = content.replace(mdImgGifRe, (_full, _alt, encGif) => {
    changed = true
    tagsConverted++
    const mp4Enc = lookupRename.get(encGif) || encGif.replace(/%2[Ee]gif$/, '%2Emp4').replace(/\.gif$/i, '.mp4')
    return `<video src="/assets/${mp4Enc}" autoplay loop muted playsinline></video>`
  })

  // Quaisquer outras refs lit. /assets/foo.gif (em texto cru) -> /assets/foo.mp4
  if (renameRe) {
    content = content.replace(renameRe, (_, from) => {
      refsRewritten++
      return `/assets/${lookupRename.get(from)}`
    })
  }

  if (changed || content !== readFileSync(md, 'utf8')) {
    writeFileSync(md, content, 'utf8')
    mdChanged++
  }
}

console.log(`Tags convertidas (img/markdown -> video): ${tagsConverted}`)
console.log(`Refs cruas reescritas: ${refsRewritten}`)
console.log(`Arquivos .md alterados: ${mdChanged}`)

// Atualiza assets-renames.json (cumulativo)
let existing = {}
if (existsSync(MAPPING_PATH)) {
  try { existing = JSON.parse(readFileSync(MAPPING_PATH, 'utf8')) } catch {}
}
const inverse = new Map(Object.entries(existing).map(([k, v]) => [v, k]))
for (const s of successful) {
  if (inverse.has(s.gif)) {
    const original = inverse.get(s.gif)
    existing[original] = s.mp4
  } else {
    existing[s.gif] = s.mp4
  }
}
mkdirSync(dirname(MAPPING_PATH), { recursive: true })
writeFileSync(MAPPING_PATH, JSON.stringify(existing, Object.keys(existing).sort(), 2) + '\n', 'utf8')
console.log(`Mapping atualizado: ${relative(ROOT, MAPPING_PATH)}`)

// Deleta os GIFs originais
if (!KEEP_GIF) {
  let deleted = 0
  for (const s of successful) {
    try { unlinkSync(join(ASSETS_DIR, s.gif)); deleted++ } catch {}
  }
  console.log(`GIFs originais deletados: ${deleted}`)
} else {
  console.log('GIFs mantidos (--keep-gif)')
}
