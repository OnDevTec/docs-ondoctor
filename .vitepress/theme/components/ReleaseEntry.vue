<script setup lang="ts">
const props = defineProps<{
  type: 'novidade' | 'correcao' | 'melhoria' | 'atualizacao'
  title: string
}>()

const BADGES = {
  novidade: 'Novidade',
  correcao: 'Correção',
  melhoria: 'Melhoria',
  atualizacao: 'Atualização'
} as const
</script>

<template>
  <section class="release-entry" :class="`release-entry--${type}`">
    <header class="release-entry__header">
      <span class="release-entry__badge">{{ BADGES[type] || 'Novidade' }}</span>
      <h3 class="release-entry__title" :id="title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')">
        {{ title }}
      </h3>
    </header>
    <div class="release-entry__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.release-entry {
  border: 1px solid var(--vp-c-divider);
  border-left-width: 4px;
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin: 1.25rem 0;
  background: var(--vp-c-bg-soft);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.release-entry:hover {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.06);
}

.release-entry--novidade   { border-left-color: #289D8F; }
.release-entry--correcao   { border-left-color: #f59e0b; }
.release-entry--melhoria   { border-left-color: #3b82f6; }
.release-entry--atualizacao { border-left-color: #8b5cf6; }

.release-entry__header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.625rem;
  margin: 0 0 0.5rem;
}

.release-entry__badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: white;
  white-space: nowrap;
  flex-shrink: 0;
}

.release-entry--novidade   .release-entry__badge { background: #289D8F; }
.release-entry--correcao   .release-entry__badge { background: #f59e0b; }
.release-entry--melhoria   .release-entry__badge { background: #3b82f6; }
.release-entry--atualizacao .release-entry__badge { background: #8b5cf6; }

.release-entry__title {
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--vp-c-text-1);
}

.release-entry__body :deep(:first-child) { margin-top: 0.25rem; }
.release-entry__body :deep(:last-child)  { margin-bottom: 0; }
.release-entry__body :deep(p)            { line-height: 1.65; }
.release-entry__body :deep(img),
.release-entry__body :deep(video)        { border-radius: 6px; }
</style>
