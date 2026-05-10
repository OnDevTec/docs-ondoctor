#!/usr/bin/env node
/**
 * Compila todos os .md da documentação em ~6 arquivos grandes agrupados por
 * seção, prontos para upload em um Custom GPT (ChatGPT) ou Assistant API.
 *
 * Cada arquivo compilado tem:
 *   - Cabeçalho explicando a seção
 *   - Cada página com seu título, URL (pra IA citar) e conteúdo limpo
 *   - Componentes Vue (ReleaseEntry) achatados em headings normais
 *   - HTML/iframes removidos (não úteis pra LLM)
 *
 * Saída: knowledge-bundle/ (gitignored — apenas para distribuição)
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { dirname, resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT_DIR = resolve(ROOT, 'knowledge-bundle')
const SITE_URL = 'https://docs.ondoctor.app'

const SKIP_DIRS = new Set(['node_modules', '.vitepress', 'public', 'scripts', 'dist', 'knowledge-bundle'])

// Define os bundles e que diretórios cada um cobre
const BUNDLES = [
  {
    name: '01-introducao-e-apresentacao.md',
    title: 'Introdução e Apresentação do OnDoctor',
    description: 'Visão geral do produto, posicionamento, especialidades atendidas e como começar.',
    matchers: [
      (rel) => rel === 'index.md',
      (rel) => rel === 'apresentacao.md',
      (rel) => rel === 'ajuda-e-manuais/index.md',
      (rel) => rel === 'universidade-ondoctor/index.md',
      (rel) => rel.startsWith('ajuda-e-manuais/passos-iniciais/apresentacao')
    ]
  },
  {
    name: '02-passos-iniciais.md',
    title: 'Passos Iniciais — Configuração e Primeiros Atendimentos',
    description: 'Sequência recomendada para um usuário novo: cadastros, agenda, orçamentos, atendimento e faturamento.',
    matchers: [(rel) => rel.startsWith('ajuda-e-manuais/passos-iniciais/')]
  },
  {
    name: '03-guia-de-uso-atendimento.md',
    title: 'Guia de Uso — Atendimento (Agenda, Prontuário, Orçamentos)',
    description: 'Documentação completa dos módulos clínicos: agenda, prontuário eletrônico (incluindo odontograma, anamneses, anexos), orçamentos, painel de atendimento e cadastros relacionados.',
    matchers: [(rel) => rel.startsWith('ajuda-e-manuais/guia-de-uso/atendimento/')]
  },
  {
    name: '04-guia-de-uso-financeiro-e-tiss.md',
    title: 'Guia de Uso — Financeiro, TISS e Configurações',
    description: 'Módulo financeiro (contas a pagar/receber, fluxo de caixa, conciliação), faturamento TISS, fiscal, configurações da empresa, equipe, procedimentos, mensagens, dashboard BI e integrações.',
    matchers: [
      (rel) => rel.startsWith('ajuda-e-manuais/guia-de-uso/financeiro/'),
      (rel) => rel.startsWith('ajuda-e-manuais/guia-de-uso/faturamento-tiss/'),
      (rel) => rel.startsWith('ajuda-e-manuais/guia-de-uso/configuracoes/'),
      (rel) => rel.startsWith('ajuda-e-manuais/guia-de-uso/dashboard-bi/'),
      (rel) => rel.startsWith('ajuda-e-manuais/guia-de-uso/marketing/'),
      (rel) => rel.startsWith('ajuda-e-manuais/guia-de-uso/cliente/'),
      (rel) => rel.startsWith('ajuda-e-manuais/guia-de-uso/estoque/'),
      (rel) => rel.startsWith('ajuda-e-manuais/guia-de-uso/inicio/'),
      (rel) => rel.startsWith('ajuda-e-manuais/guia-de-uso/integracoes/'),
      (rel) => rel.startsWith('ajuda-e-manuais/guia-de-uso/fiscal'),
      (rel) => rel === 'ajuda-e-manuais/guia-de-uso/index.md'
    ]
  },
  {
    name: '05-faq.md',
    title: 'FAQ — Perguntas Frequentes',
    description: 'Respostas curtas e diretas para dúvidas comuns sobre uso do OnDoctor.',
    matchers: [(rel) => rel.startsWith('ajuda-e-manuais/faq/')]
  },
  {
    name: '06-novidades-recentes.md',
    title: 'Novidades — Histórico de Atualizações 2023 a 2026',
    description: 'Release notes recentes: novas funcionalidades, correções e melhorias por versão.',
    matchers: [
      (rel) => rel === 'novidades/index.md',
      (rel) => /^novidades\/lancamentos-(2023|2024|2025|2026)\//.test(rel)
    ]
  },
  {
    name: '07-novidades-historico.md',
    title: 'Novidades — Histórico Antigo 2020 a 2022',
    description: 'Release notes históricas. Útil para entender evolução do produto.',
    matchers: [(rel) => /^novidades\/lancamentos-(2020|2021|2022)\//.test(rel)]
  },
  {
    name: '08-termos-e-privacidade.md',
    title: 'Termos de Uso, Privacidade e Consentimento',
    description: 'Documentos legais. Inclui política de privacidade com seção LGPD/GA4 sobre análise de uso da documentação online.',
    matchers: [
      (rel) => rel.startsWith('termos/'),
      (rel) => rel.startsWith('dados/')
    ]
  }
]

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

function pathToUrl(rel) {
  let url = rel.replace(/\\/g, '/')
  url = url.replace(/(^|\/)index\.md$/, '$1')
  url = url.replace(/\.md$/, '')
  if (!url.startsWith('/')) url = '/' + url
  return SITE_URL + url
}

function stripFrontmatter(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

function flattenForLLM(content) {
  let out = content

  // ReleaseEntry abertura -> heading com badge
  out = out.replace(/<ReleaseEntry\s+type="(\w+)"\s+title="([^"]+)"\s*>/g, (m, type, title) => {
    const labels = { novidade: 'Novidade', correcao: 'Correção', melhoria: 'Melhoria', atualizacao: 'Atualização' }
    return `### [${labels[type] || 'Novidade'}] ${title}`
  })
  out = out.replace(/<\/ReleaseEntry>/g, '')

  // <video> e <iframe> embedados — substitui por nota textual
  out = out.replace(/<div[^>]*>\s*<iframe[^>]*src="([^"]+)"[^>]*><\/iframe>\s*<\/div>/gi, '\n*[Vídeo embedado: $1]*\n')
  out = out.replace(/<iframe[^>]*src="([^"]+)"[^>]*><\/iframe>/gi, '\n*[Vídeo: $1]*\n')
  out = out.replace(/<video[^>]*src="([^"]+)"[^>]*>[\s\S]*?<\/video>/gi, '\n*[Vídeo: $1]*\n')

  // <figure>/figcaption -> markdown image + legenda
  out = out.replace(/<figure>\s*<img[^>]*src="([^"]+)"[^>]*\/?>\s*(?:<figcaption>([\s\S]*?)<\/figcaption>)?\s*<\/figure>/gi, (m, src, caption) => {
    const c = caption ? `\n*${caption.replace(/<[^>]+>/g, '').trim()}*\n` : ''
    return `![](${src})${c}`
  })

  // <img> isolado -> markdown image
  out = out.replace(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)')
  out = out.replace(/<img[^>]*src="([^"]+)"[^>]*\/?>/gi, '![]($1)')

  // Outros divs/spans com style — strip mantendo conteúdo
  out = out.replace(/<\/?(div|span|section)[^>]*>/g, '')

  // Comentários HTML
  out = out.replace(/<!--[\s\S]*?-->/g, '')

  // Espaços/blank lines excessivos
  out = out.replace(/\n{3,}/g, '\n\n')

  return out.trim()
}

function extractTitle(content, fallback) {
  const m = content.match(/^#\s+(.+?)\s*$/m)
  return m ? m[1].trim() : fallback
}

function compile() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const allFiles = walkMd(ROOT).map(f => relative(ROOT, f).replace(/\\/g, '/')).sort()
  const used = new Set()
  let totalPages = 0
  let totalBytes = 0

  for (const bundle of BUNDLES) {
    const matched = allFiles.filter(f => bundle.matchers.some(m => m(f)))
    for (const f of matched) used.add(f)

    let out = ''
    out += `# ${bundle.title}\n\n`
    out += `${bundle.description}\n\n`
    out += `Esta é uma compilação automática da documentação oficial do OnDoctor (https://docs.ondoctor.app). `
    out += `Cada seção abaixo corresponde a uma página da doc, com a URL canônica para citação.\n\n`
    out += `Quantidade de páginas neste arquivo: ${matched.length}.\n\n`
    out += `---\n\n`

    for (const f of matched) {
      const fullPath = resolve(ROOT, f)
      const raw = readFileSync(fullPath, 'utf-8')
      const body = flattenForLLM(stripFrontmatter(raw))
      const title = extractTitle(raw, f.replace(/[/_-]/g, ' '))
      const url = pathToUrl(f)

      out += `## ${title}\n\n`
      out += `**URL:** ${url}\n\n`
      out += body
      out += `\n\n---\n\n`
    }

    const outPath = join(OUT_DIR, bundle.name)
    writeFileSync(outPath, out, 'utf-8')
    const bytes = Buffer.byteLength(out, 'utf-8')
    totalBytes += bytes
    totalPages += matched.length
    console.log(`  ${bundle.name.padEnd(45)} ${String(matched.length).padStart(3)} pages  ${(bytes / 1024).toFixed(1)} KB`)
  }

  // Páginas órfãs (não casaram com nenhum bundle)
  const orphans = allFiles.filter(f => !used.has(f))
  if (orphans.length > 0) {
    console.log(`\nÓrfãs (não incluídas em nenhum bundle):`)
    for (const o of orphans) console.log(`  ${o}`)
  }

  console.log(`\nResumo:`)
  console.log(`  Bundles gerados: ${BUNDLES.length}`)
  console.log(`  Páginas cobertas: ${totalPages} de ${allFiles.length}`)
  console.log(`  Tamanho total: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`)
  console.log(`  Saída: ${OUT_DIR}`)
}

compile()
