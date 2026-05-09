<script setup lang="ts">
import { ref, onMounted } from 'vue'

const STORAGE_KEY = 'ondoctor-consent-v1'
const visible = ref(false)

onMounted(() => {
  if (typeof window === 'undefined') return
  // Só aparece se o usuário já decidiu uma vez (granted/denied).
  // Antes disso, o próprio banner está aberto e este botão é redundante.
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'granted' || stored === 'denied') visible.value = true
  } catch { /* ignore */ }
})

function open() {
  const w = window as any
  if (typeof w.reopenConsentBanner === 'function') w.reopenConsentBanner()
}
</script>

<template>
  <button
    v-if="visible"
    type="button"
    class="manage-cookies-btn"
    aria-label="Gerenciar cookies"
    title="Gerenciar cookies"
    @click="open"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 11.5a9 9 0 1 1-9-9 4 4 0 0 0 4 4 4 4 0 0 0 4 4"/>
      <path d="M8.5 8.5v.01"/>
      <path d="M16 15.5v.01"/>
      <path d="M12 12v.01"/>
      <path d="M11 17v.01"/>
      <path d="M7 14v.01"/>
    </svg>
    <span class="manage-cookies-btn__label">Cookies</span>
  </button>
</template>

<style scoped>
.manage-cookies-btn {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.85rem;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  font-family: inherit;
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.06);
  z-index: 50;
  opacity: 0.65;
  transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.manage-cookies-btn:hover,
.manage-cookies-btn:focus-visible {
  opacity: 1;
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  outline: none;
}

@media (max-width: 720px) {
  .manage-cookies-btn__label { display: none; }
  .manage-cookies-btn {
    padding: 0.55rem;
    bottom: 0.75rem;
    right: 0.75rem;
  }
}
</style>
