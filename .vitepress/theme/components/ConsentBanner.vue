<script setup lang="ts">
import { ref, onMounted } from 'vue'

const STORAGE_KEY = 'ondoctor-consent-v1'
const visible = ref(false)

function applyConsent(grant: boolean) {
  const w = window as any
  if (typeof w.gtag === 'function') {
    w.gtag('consent', 'update', {
      ad_storage: grant ? 'granted' : 'denied',
      ad_user_data: grant ? 'granted' : 'denied',
      ad_personalization: grant ? 'granted' : 'denied',
      analytics_storage: grant ? 'granted' : 'denied'
    })
  }
  try {
    localStorage.setItem(STORAGE_KEY, grant ? 'granted' : 'denied')
    localStorage.setItem(STORAGE_KEY + ':timestamp', new Date().toISOString())
  } catch { /* navegação privada bloqueia localStorage */ }
  visible.value = false
}

onMounted(() => {
  let stored: string | null = null
  try { stored = localStorage.getItem(STORAGE_KEY) } catch { /* ignore */ }

  if (stored === 'granted') {
    // Restaura consentimento concedido em visita anterior
    applyConsent(true)
  } else if (stored === 'denied') {
    // Já recusou antes; mantém denied (default), não mostra banner
  } else {
    // Primeira visita ou storage limpo
    visible.value = true
  }
})

// Exposto globalmente para reabrir o banner via "Gerenciar cookies" em rodapé/política
if (typeof window !== 'undefined') {
  ;(window as any).reopenConsentBanner = () => {
    visible.value = true
  }
}
</script>

<template>
  <Transition name="consent-fade">
    <div v-if="visible" class="consent-banner" role="dialog" aria-label="Consentimento de cookies" aria-live="polite">
      <div class="consent-banner__content">
        <div class="consent-banner__text">
          <strong>Cookies e análise de uso</strong>
          <p>
            Usamos cookies de análise (Google Analytics) para entender como você navega nesta documentação e melhorá-la.
            Nada é compartilhado com terceiros para fins de publicidade.
            Saiba mais na <a href="/termos/termos-de-privacidade">política de privacidade</a>.
          </p>
        </div>
        <div class="consent-banner__actions">
          <button type="button" class="consent-banner__btn consent-banner__btn--ghost" @click="applyConsent(false)">
            Recusar
          </button>
          <button type="button" class="consent-banner__btn consent-banner__btn--primary" @click="applyConsent(true)">
            Aceitar
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.consent-banner {
  position: fixed;
  bottom: 1rem;
  left: 1rem;
  right: 1rem;
  max-width: 760px;
  margin: 0 auto;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.04), 0 12px 32px rgba(0, 0, 0, 0.12);
  padding: 1.1rem 1.25rem;
  z-index: 1000;
}

.consent-banner__content {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

@media (min-width: 720px) {
  .consent-banner__content {
    flex-direction: row;
    align-items: center;
    gap: 1.5rem;
  }
}

.consent-banner__text {
  flex: 1;
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}

.consent-banner__text strong {
  display: block;
  color: var(--vp-c-text-1);
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.consent-banner__text p {
  margin: 0;
}

.consent-banner__text a {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
}

.consent-banner__actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.consent-banner__btn {
  padding: 0.55rem 1.1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  font-family: inherit;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}

.consent-banner__btn--primary {
  background: #289D8F;
  color: white;
}

.consent-banner__btn--primary:hover {
  background: #1d8b7e;
}

.consent-banner__btn--ghost {
  background: transparent;
  color: var(--vp-c-text-2);
  border-color: var(--vp-c-divider);
}

.consent-banner__btn--ghost:hover {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border-color: var(--vp-c-text-3);
}

.consent-fade-enter-active,
.consent-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.consent-fade-enter-from,
.consent-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
