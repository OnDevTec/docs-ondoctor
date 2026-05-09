import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import ChildPages from './components/ChildPages.vue'
import ReleaseEntry from './components/ReleaseEntry.vue'
import ReleasesTimeline from './components/ReleasesTimeline.vue'
import Layout from './Layout.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app, router }) {
    app.component('ChildPages', ChildPages)
    app.component('ReleaseEntry', ReleaseEntry)
    app.component('ReleasesTimeline', ReleasesTimeline)

    if (typeof window !== 'undefined') {
      const gtag = (...args: any[]) => {
        const w = window as any
        if (typeof w.gtag === 'function') w.gtag(...args)
      }

      // Mapeia texto do grupo de topo da sidebar -> identificador de ícone.
      // O CSS em theme/style.css usa o atributo data-sidebar-icon para aplicar
      // a imagem correta. Robusto a reordenação (não depende de nth-of-type).
      const SIDEBAR_ICONS: Record<string, string> = {
        'Introdução': 'intro',
        'Universidade OnDoctor': 'universidade',
        'Novidades Versões': 'novidades',
        'Novidades': 'novidades',
        'Termos & Privacidade': 'termos',
        'Termos': 'termos',
        'FAQ': 'faq'
      }
      function tagSidebarIcons() {
        document.querySelectorAll<HTMLElement>('.VPSidebarItem.level-0').forEach(el => {
          const text = el.querySelector('.item .text')?.textContent?.trim()
          const expected = text ? SIDEBAR_ICONS[text] : undefined
          const current = el.getAttribute('data-sidebar-icon')
          if (expected && current !== expected) el.setAttribute('data-sidebar-icon', expected)
          else if (!expected && current) el.removeAttribute('data-sidebar-icon')
        })
      }
      // Inicial + observa mutações no <aside> da sidebar (re-render do Vue)
      const tagOnReady = () => {
        tagSidebarIcons()
        const sidebar = document.querySelector('.VPSidebar') || document.querySelector('aside')
        if (sidebar) {
          new MutationObserver(() => tagSidebarIcons()).observe(sidebar, { childList: true, subtree: true })
        } else {
          // Sidebar ainda não está no DOM (ex: SSR -> hydration); tenta de novo
          requestAnimationFrame(tagOnReady)
        }
      }
      tagOnReady()

      // 1. Pageviews em navegação SPA (a primeira é disparada pelo gtag config no head)
      router.onAfterRouteChanged = (to: string) => {
        gtag('event', 'page_view', {
          page_path: to,
          page_location: window.location.href,
          page_title: document.title
        })
      }

      // 2. Toggle de dark/light mode — observa mudança da classe 'dark' no <html>
      let lastTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      const themeObserver = new MutationObserver(() => {
        const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
        if (current !== lastTheme) {
          gtag('event', 'theme_toggle', { theme: current, previous: lastTheme })
          lastTheme = current
        }
      })
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

      // 3. Cliques em links externos (incluindo destaque para WhatsApp/CTA)
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null
        const link = target?.closest?.('a') as HTMLAnchorElement | null
        if (!link?.href) return
        let parsed: URL
        try { parsed = new URL(link.href) } catch { return }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
        if (parsed.hostname === window.location.hostname) return

        const text = (link.textContent || '').trim().slice(0, 60)
        const isWhatsApp = /whatsapp|w\.app|wa\.me/i.test(parsed.hostname)
        const isYouTube = /youtu\.?be|youtube/i.test(parsed.hostname)

        if (isWhatsApp) {
          gtag('event', 'click_whatsapp', {
            link_url: parsed.toString(),
            link_text: text,
            page_path: window.location.pathname
          })
        } else if (isYouTube) {
          gtag('event', 'click_youtube', {
            link_url: parsed.toString(),
            link_text: text,
            page_path: window.location.pathname
          })
        } else {
          gtag('event', 'click_external', {
            link_url: parsed.toString(),
            link_domain: parsed.hostname,
            link_text: text,
            page_path: window.location.pathname
          })
        }
      }, { capture: true, passive: true })

      // 4. Cliques no botão de Edit on GitHub (sinal de contribuição)
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null
        const link = target?.closest?.('.VPDocFooter a[href*="/edit/main/"]') as HTMLAnchorElement | null
        if (!link) return
        gtag('event', 'click_edit_page', {
          page_path: window.location.pathname,
          page_title: document.title
        })
      }, { capture: true, passive: true })
    }
  }
} satisfies Theme
