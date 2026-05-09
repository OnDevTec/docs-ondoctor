import { defineConfig, type DefaultTheme } from 'vitepress'
import sidebarData from './sidebar.json' with { type: 'json' }
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const sidebar = sidebarData as unknown as DefaultTheme.Sidebar

const SITE_URL = 'https://docs.ondoctor.app'
const OG_IMAGE = `${SITE_URL}/og-image.png`
const GA4_ID = 'G-ZSDP7J5WV3'

function extractDescription(srcDir: string, relativePath: string): string {
  const fullPath = resolve(srcDir, relativePath)
  if (!existsSync(fullPath)) return ''
  const content = readFileSync(fullPath, 'utf-8')
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  const cleaned = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#]/g, '')
  const paragraphs = cleaned.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(p => p.length > 30)
  const first = paragraphs[0] || ''
  return first.slice(0, 160).replace(/\s+/g, ' ').trim()
}

export default defineConfig({
  lang: 'pt-BR',
  title: 'OnDoctor',
  description: 'Documentação oficial do OnDoctor — gestão para clínicas e consultórios.',
  cleanUrls: true,
  lastUpdated: true,

  // Gera /sitemap.xml com todas as páginas. Ajuste o hostname para o domínio final.
  sitemap: {
    hostname: SITE_URL
  },

  // Injeta og:* / twitter:* / description por página, com auto-extract
  // do primeiro parágrafo quando não há frontmatter description.
  transformPageData(pageData, ctx) {
    const description =
      pageData.description ||
      (pageData.frontmatter.description as string | undefined) ||
      extractDescription(ctx.siteConfig.srcDir, pageData.relativePath)

    pageData.description = description

    const title = (pageData.frontmatter.title as string | undefined) || pageData.title || 'OnDoctor'
    const url = SITE_URL + '/' + pageData.relativePath
      .replace(/(^|\/)index\.md$/, '$1')
      .replace(/\.md$/, '')

    pageData.frontmatter.head ??= []
    pageData.frontmatter.head.push(
      ['meta', { name: 'description', content: description }],
      ['meta', { property: 'og:type', content: 'article' }],
      ['meta', { property: 'og:title', content: `${title} | OnDoctor` }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:image', content: OG_IMAGE }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:site_name', content: 'OnDoctor — Documentação' }],
      ['meta', { property: 'og:locale', content: 'pt_BR' }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['meta', { name: 'twitter:image', content: OG_IMAGE }]
    )
  },

  // Assets em /public/assets são servidos diretamente pelo browser.
  // O Vue por padrão tenta importar src absolutos como módulos — desligamos isso aqui.
  vue: {
    template: {
      transformAssetUrls: {
        video: ['src', 'poster'],
        source: ['src'],
        img: [],
        image: ['xlink:href', 'href'],
        use: ['xlink:href', 'href']
      }
    }
  },

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico', sizes: 'any' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
    ['meta', { name: 'theme-color', content: '#289D8F' }],
    // Ubuntu (família tipográfica do manual da marca)
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Ubuntu:wght@300;400;500;700&display=swap' }],
    // Google Analytics 4 com Consent Mode v2 (LGPD/GDPR)
    // Começa com tudo 'denied' — só envia hits após aceite no banner.
    ['script', { async: '', src: `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}` }],
    ['script', {}, `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  wait_for_update: 500
});
gtag('js', new Date());
gtag('config', '${GA4_ID}', { anonymize_ip: true });`]
  ],

  themeConfig: {
    logo: { src: '/assets/ondoctor-symbol.png', alt: 'OnDoctor', width: 28, height: 28 },
    siteTitle: 'OnDoctor',

    nav: [
      { text: 'Início', link: '/' },
      { text: 'Universidade', link: '/universidade-ondoctor/passos-iniciais/' },
      { text: 'Novidades', link: '/novidades/' },
      { text: 'FAQ', link: '/universidade-ondoctor/faq/' }
    ],

    sidebar,

    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: 'Buscar', buttonAriaLabel: 'Buscar' },
              modal: {
                noResultsText: 'Nenhum resultado para',
                resetButtonTitle: 'Limpar busca',
                footer: {
                  selectText: 'selecionar',
                  navigateText: 'navegar',
                  closeText: 'fechar'
                }
              }
            }
          }
        }
      }
    },

    outline: { label: 'Nesta página', level: [2, 3] },
    docFooter: { prev: 'Anterior', next: 'Próximo' },
    lastUpdatedText: 'Atualizado em',
    returnToTopLabel: 'Voltar ao topo',
    sidebarMenuLabel: 'Menu',
    darkModeSwitchLabel: 'Tema',
    lightModeSwitchTitle: 'Mudar para modo claro',
    darkModeSwitchTitle: 'Mudar para modo escuro'
  }
})
