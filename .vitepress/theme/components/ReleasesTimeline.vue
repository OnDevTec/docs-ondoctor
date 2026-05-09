<script setup lang="ts">
import { computed } from 'vue'
import { data as releases, type Release } from '../../../novidades/releases.data'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface YearGroup {
  year: number
  releases: Release[]
  total: number
}

const byYear = computed<YearGroup[]>(() => {
  const groups = new Map<number, Release[]>()
  for (const r of releases) {
    if (!groups.has(r.year)) groups.set(r.year, [])
    groups.get(r.year)!.push(r)
  }
  return [...groups.entries()]
    .map(([year, list]) => ({ year, releases: list, total: list.length }))
    .sort((a, b) => b.year - a.year)
})

const totals = computed(() => {
  const t = { novidade: 0, correcao: 0, melhoria: 0, atualizacao: 0, releases: releases.length }
  for (const r of releases) {
    t.novidade += r.counts.novidade
    t.correcao += r.counts.correcao
    t.melhoria += r.counts.melhoria
    t.atualizacao += r.counts.atualizacao
  }
  return t
})
</script>

<template>
  <div class="releases-stats">
    <div class="releases-stats__item">
      <strong>{{ totals.releases }}</strong>
      <span>versões publicadas</span>
    </div>
    <div class="releases-stats__item releases-stats__item--novidade">
      <strong>{{ totals.novidade }}</strong>
      <span>novidades</span>
    </div>
    <div class="releases-stats__item releases-stats__item--correcao">
      <strong>{{ totals.correcao }}</strong>
      <span>correções</span>
    </div>
    <div class="releases-stats__item releases-stats__item--melhoria">
      <strong>{{ totals.melhoria }}</strong>
      <span>melhorias</span>
    </div>
  </div>

  <div class="timeline">
    <section v-for="group in byYear" :key="group.year" class="timeline__year">
      <header class="timeline__year-header">
        <h2>{{ group.year }}</h2>
        <span class="timeline__year-count">{{ group.total }} versõ{{ group.total === 1 ? 'es' : 'es' }}</span>
      </header>

      <ol class="timeline__list">
        <li v-for="r in group.releases" :key="r.url" class="timeline__release">
          <div class="timeline__date">
            <span class="timeline__day">{{ r.displayDate.slice(0, 2) }}</span>
            <span class="timeline__month">{{ MONTHS[r.month - 1] }}</span>
          </div>
          <div class="timeline__body">
            <a :href="r.url" class="timeline__link">Versão de {{ r.displayDate }}</a>
            <div class="timeline__badges">
              <span v-if="r.counts.novidade > 0" class="badge badge--novidade">
                {{ r.counts.novidade }} novidade<span v-if="r.counts.novidade > 1">s</span>
              </span>
              <span v-if="r.counts.correcao > 0" class="badge badge--correcao">
                {{ r.counts.correcao }} correção<span v-if="r.counts.correcao > 1">ões</span>
              </span>
              <span v-if="r.counts.melhoria > 0" class="badge badge--melhoria">
                {{ r.counts.melhoria }} melhoria<span v-if="r.counts.melhoria > 1">s</span>
              </span>
            </div>
            <ul v-if="r.highlights.length > 0" class="timeline__highlights">
              <li v-for="(h, i) in r.highlights" :key="i">{{ h }}</li>
            </ul>
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.releases-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
  margin: 1.5rem 0 2rem;
}

.releases-stats__item {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 0.875rem 1rem;
  display: flex;
  flex-direction: column;
}
.releases-stats__item strong {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
  line-height: 1;
}
.releases-stats__item span {
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
}
.releases-stats__item--novidade  { border-left: 3px solid #289D8F; }
.releases-stats__item--correcao  { border-left: 3px solid #f59e0b; }
.releases-stats__item--melhoria  { border-left: 3px solid #3b82f6; }

.timeline {
  margin-top: 2rem;
}

.timeline__year {
  margin-bottom: 2.5rem;
}

.timeline__year-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 2px solid var(--vp-c-divider);
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
}
.timeline__year-header h2 {
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  font-size: 1.5rem;
  font-weight: 700;
}
.timeline__year-count {
  font-size: 0.85rem;
  color: var(--vp-c-text-3);
}

.timeline__list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.timeline__release {
  display: flex;
  gap: 1.25rem;
  padding: 0.875rem 0;
  border-bottom: 1px solid var(--vp-c-divider);
}
.timeline__release:last-child { border-bottom: 0; }

.timeline__date {
  flex-shrink: 0;
  width: 56px;
  text-align: center;
  padding-top: 0.1rem;
}
.timeline__day {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
  color: var(--vp-c-brand-1);
}
.timeline__month {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vp-c-text-3);
}

.timeline__body { flex: 1; min-width: 0; }
.timeline__link {
  font-weight: 600;
  font-size: 1rem;
  color: var(--vp-c-text-1);
  text-decoration: none;
}
.timeline__link:hover { color: var(--vp-c-brand-1); }

.timeline__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.4rem 0;
}
.badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: white;
  white-space: nowrap;
}
.badge--novidade  { background: #289D8F; }
.badge--correcao  { background: #f59e0b; }
.badge--melhoria  { background: #3b82f6; }

.timeline__highlights {
  margin: 0.4rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
.timeline__highlights li { margin-bottom: 0.15rem; }
</style>
