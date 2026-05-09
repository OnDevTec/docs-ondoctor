import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import ReleaseEntry from './components/ReleaseEntry.vue'
import Layout from './Layout.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app, router }) {
    app.component('ReleaseEntry', ReleaseEntry)

    // Rastreamento de navegação SPA para GA4. A primeira pageview é
    // disparada pelo gtag('config', ...) carregado no head; aqui captamos
    // as mudanças de rota client-side que VitePress faz sem reload.
    if (typeof window !== 'undefined') {
      router.onAfterRouteChanged = (to: string) => {
        const w = window as any
        if (typeof w.gtag === 'function') {
          w.gtag('event', 'page_view', {
            page_path: to,
            page_location: window.location.href,
            page_title: document.title
          })
        }
      }
    }
  }
} satisfies Theme
