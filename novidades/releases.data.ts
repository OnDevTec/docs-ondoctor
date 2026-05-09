/**
 * Data loader VitePress que escaneia novidades/lancamentos-YYYY/versao-DD-MM-YYYY.md,
 * lê cada release e produz uma lista ordenada (mais recente primeiro) com
 * contagem de tipos de entry e títulos dos primeiros highlights.
 *
 * Consumido pelo componente <ReleasesTimeline> em /novidades/index.md.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ReleaseEntry {
  type: 'novidade' | 'correcao' | 'melhoria' | 'atualizacao'
  title: string
}

export interface Release {
  date: string         // ISO YYYY-MM-DD para ordenação
  displayDate: string  // DD/MM/YYYY para exibição
  year: number
  month: number
  url: string
  counts: { novidade: number; correcao: number; melhoria: number; atualizacao: number }
  highlights: string[]
}

declare const data: Release[]
export { data }

const __dirname = dirname(fileURLToPath(import.meta.url))

function listReleaseFiles(): { absPath: string; year: number; relPath: string }[] {
  const out: { absPath: string; year: number; relPath: string }[] = []
  const yearDirs = readdirSync(__dirname).filter(d => /^lancamentos-\d{4}$/.test(d))
  for (const yd of yearDirs) {
    const year = parseInt(yd.slice(-4), 10)
    const yearPath = join(__dirname, yd)
    if (!statSync(yearPath).isDirectory()) continue
    for (const f of readdirSync(yearPath)) {
      if (!/^versao-\d{2}-\d{2}-\d{4}\.md$/.test(f)) continue
      out.push({
        absPath: join(yearPath, f),
        year,
        relPath: `${yd}/${f}`
      })
    }
  }
  return out
}

function parseRelease(absPath: string, year: number, relPath: string): Release | null {
  const fname = relPath.split('/').pop() || ''
  const m = fname.match(/^versao-(\d{2})-(\d{2})-(\d{4})\.md$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const isoDate = `${yyyy}-${mm}-${dd}`
  const displayDate = `${dd}/${mm}/${yyyy}`
  const url = `/novidades/${relPath.replace(/\.md$/, '')}`

  let content = ''
  try { content = readFileSync(absPath, 'utf-8') } catch { return null }

  // Conta os <ReleaseEntry type="..."> no markdown migrado
  const counts = { novidade: 0, correcao: 0, melhoria: 0, atualizacao: 0 }
  const entryRe = /<ReleaseEntry\s+type="(novidade|correcao|melhoria|atualizacao)"\s+title="([^"]+)"/g
  const highlights: string[] = []
  let match: RegExpExecArray | null
  while ((match = entryRe.exec(content))) {
    const [, type, title] = match
    counts[type as keyof typeof counts]++
    if (highlights.length < 5) {
      highlights.push(title.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
    }
  }

  return {
    date: isoDate,
    displayDate,
    year: parseInt(yyyy, 10),
    month: parseInt(mm, 10),
    url,
    counts,
    highlights
  }
}

export default {
  watch: ['./lancamentos-*/versao-*.md'],
  load(): Release[] {
    const files = listReleaseFiles()
    const releases: Release[] = []
    for (const f of files) {
      const r = parseRelease(f.absPath, f.year, f.relPath)
      if (r) releases.push(r)
    }
    releases.sort((a, b) => b.date.localeCompare(a.date))
    return releases
  }
}
