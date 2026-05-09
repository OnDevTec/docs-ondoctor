<script setup lang="ts">
import { computed } from 'vue'
import { useData, useRoute, withBase } from 'vitepress'

const props = withDefaults(defineProps<{
  /** Override do path-base; se omitido usa a rota atual */
  base?: string
  /** Limita quantos cards mostrar (sem limite por default) */
  limit?: number
  /** Mostra apenas filhos diretos (true) ou achata recursivamente (false) */
  flat?: boolean
}>(), {
  flat: false
})

const route = useRoute()
const { theme } = useData()

interface SidebarItem {
  text?: string
  link?: string
  items?: SidebarItem[]
  collapsed?: boolean
}

interface ChildCard {
  text: string
  link?: string
  count: number  // quantidade de sub-itens (0 se for folha)
}

function normalize(p: string): string {
  return (p || '').replace(/\/$/, '').replace(/\.html$/, '') || '/'
}

function findItem(items: SidebarItem[], path: string): SidebarItem | null {
  const norm = normalize(path)
  const prefix = norm.endsWith('/') ? norm : norm + '/'

  for (const it of items) {
    // 1. Match direto por link (ex: "Passos Iniciais" → /passos-iniciais/)
    if (it.link && normalize(it.link) === norm) return it
    // 2. Recursa primeiro (mais específico vence)
    if (it.items?.length) {
      const deeper = findItem(it.items, path)
      if (deeper) return deeper
    }
  }
  // 3. Fallback: group sem link próprio cujos filhos têm o prefixo do path
  // (ex: "Universidade OnDoctor" não tem link mas seus filhos começam com /universidade-ondoctor/)
  for (const it of items) {
    if (!it.link && it.items?.length) {
      const matches = it.items.some(c => c.link && normalize(c.link).startsWith(prefix))
      if (matches) return it
    }
  }
  return null
}

function countLeaves(item: SidebarItem): number {
  if (!item.items?.length) return 1
  return item.items.reduce((acc, c) => acc + countLeaves(c), 0)
}

const cards = computed<ChildCard[]>(() => {
  const sidebar = theme.value.sidebar
  let items: SidebarItem[] = []
  if (Array.isArray(sidebar)) items = sidebar
  else if (sidebar && typeof sidebar === 'object') items = (sidebar as any)['/'] || []

  const targetPath = props.base || route.path
  const node = findItem(items, targetPath)
  if (!node?.items?.length) return []

  const cards: ChildCard[] = node.items.map(child => ({
    text: child.text || '',
    link: child.link,
    count: countLeaves(child) - (child.link ? 1 : 0)  // não conta a página índice
  }))

  return props.limit ? cards.slice(0, props.limit) : cards
})

const hasCards = computed(() => cards.value.length > 0)
</script>

<template>
  <div v-if="hasCards" class="child-pages">
    <a
      v-for="(c, i) in cards"
      :key="i"
      :href="c.link ? withBase(c.link) : '#'"
      class="child-pages__card"
      :class="{ 'child-pages__card--disabled': !c.link }"
    >
      <div class="child-pages__title">
        <span>{{ c.text }}</span>
        <span v-if="c.count > 0" class="child-pages__count" :title="`${c.count} ${c.count === 1 ? 'subitem' : 'subitens'}`">
          {{ c.count }}
        </span>
      </div>
      <span v-if="c.link" class="child-pages__cta">Acessar →</span>
    </a>
  </div>
</template>

<style scoped>
.child-pages {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.875rem;
  margin: 1.5rem 0;
}

.child-pages__card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 1rem 1.1rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  text-decoration: none !important;
  color: inherit;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  min-height: 96px;
}

.child-pages__card:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(40, 157, 143, 0.08);
}

.child-pages__card--disabled {
  cursor: default;
  opacity: 0.6;
}
.child-pages__card--disabled:hover {
  border-color: var(--vp-c-divider);
  transform: none;
  box-shadow: none;
}

.child-pages__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--vp-c-text-1);
  line-height: 1.35;
}

.child-pages__count {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  padding: 0 0.45rem;
  height: 22px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  background: rgba(40, 157, 143, 0.12);
  border-radius: 999px;
}

.child-pages__cta {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--vp-c-brand-1);
}
</style>
