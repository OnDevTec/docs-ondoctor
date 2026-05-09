<script setup lang="ts">
import { computed } from 'vue'
import { useData, useRoute, withBase } from 'vitepress'

const route = useRoute()
const { theme, page } = useData()

interface Crumb { text: string; link?: string }

function findInSidebar(items: any[], path: string, trail: Crumb[] = []): Crumb[] | null {
  for (const item of items) {
    const newTrail = item.text ? [...trail, { text: item.text, link: item.link }] : trail
    if (item.link && normalize(item.link) === normalize(path)) return newTrail
    if (Array.isArray(item.items)) {
      const found = findInSidebar(item.items, path, newTrail)
      if (found) return found
    }
  }
  return null
}

function normalize(p: string): string {
  return p.replace(/\/$/, '').replace(/\.html$/, '') || '/'
}

const crumbs = computed<Crumb[]>(() => {
  // Não renderiza na home
  if (route.path === '/' || route.path === '') return []

  const sidebarConfig = theme.value.sidebar
  let items: any[] = []
  if (Array.isArray(sidebarConfig)) {
    items = sidebarConfig
  } else if (sidebarConfig && typeof sidebarConfig === 'object') {
    // Pega o sidebar de '/' por default
    items = (sidebarConfig as any)['/'] || []
  }

  const found = findInSidebar(items, route.path)
  if (found && found.length > 0) {
    // Remove o último (página atual) para não duplicar com o título
    const path = [{ text: 'Início', link: '/' }, ...found]
    return path
  }
  // Fallback: deriva do path da URL
  const segments = route.path.split('/').filter(Boolean)
  const out: Crumb[] = [{ text: 'Início', link: '/' }]
  let acc = ''
  for (const seg of segments) {
    acc += '/' + seg
    out.push({
      text: decodeURIComponent(seg).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      link: acc + '/'
    })
  }
  return out
})

const visibleCrumbs = computed(() => {
  // Última item é a página atual; mostra sem link
  return crumbs.value.map((c, i) => ({
    ...c,
    isLast: i === crumbs.value.length - 1
  }))
})
</script>

<template>
  <nav v-if="crumbs.length > 1" class="breadcrumbs" aria-label="Caminho">
    <template v-for="(c, i) in visibleCrumbs" :key="i">
      <span class="breadcrumbs__item">
        <a v-if="!c.isLast && c.link" :href="withBase(c.link)" class="breadcrumbs__link">{{ c.text }}</a>
        <span v-else class="breadcrumbs__current">{{ c.text }}</span>
      </span>
      <span v-if="!c.isLast" class="breadcrumbs__sep" aria-hidden="true">/</span>
    </template>
  </nav>
</template>
