<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const submitted = ref<null | 'helpful' | 'unhelpful'>(null)
const comment = ref('')
const commentSent = ref(false)

const showCommentBox = computed(() => submitted.value === 'unhelpful' && !commentSent.value)

function track(eventName: string, params: Record<string, any>) {
  const w = window as any
  if (typeof w.gtag === 'function') w.gtag('event', eventName, params)
}

function submit(helpful: boolean) {
  if (submitted.value) return
  submitted.value = helpful ? 'helpful' : 'unhelpful'
  track('feedback_page', {
    page_path: route.path,
    page_title: document.title,
    helpful
  })
}

function sendComment() {
  const text = comment.value.trim()
  if (!text) return
  track('feedback_comment', {
    page_path: route.path,
    page_title: document.title,
    comment: text.slice(0, 500)
  })
  commentSent.value = true
}
</script>

<template>
  <div class="page-feedback">
    <Transition name="feedback-fade" mode="out-in">
      <div v-if="!submitted" key="ask" class="page-feedback__row">
        <span class="page-feedback__question">Esta página foi útil?</span>
        <div class="page-feedback__buttons">
          <button type="button" class="page-feedback__btn" aria-label="Sim, foi útil" @click="submit(true)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M7 10v12"/>
              <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l4.34-7.07a1 1 0 0 1 1.66.05L15 5.88Z"/>
            </svg>
            <span>Sim</span>
          </button>
          <button type="button" class="page-feedback__btn" aria-label="Não, não foi útil" @click="submit(false)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M17 14V2"/>
              <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17v12l-4.34 7.07a1 1 0 0 1-1.66-.05L9 18.12Z"/>
            </svg>
            <span>Não</span>
          </button>
        </div>
      </div>

      <div v-else-if="showCommentBox" key="comment" class="page-feedback__column">
        <p class="page-feedback__thanks">
          Obrigado pelo feedback. Pode contar o que faltou? <span class="page-feedback__hint">(opcional)</span>
        </p>
        <textarea
          v-model="comment"
          class="page-feedback__textarea"
          placeholder="Ex: faltou exemplo prático, instrução pouco clara, link quebrado…"
          maxlength="500"
          rows="3"
        ></textarea>
        <div class="page-feedback__row page-feedback__row--end">
          <button type="button" class="page-feedback__btn page-feedback__btn--ghost" @click="commentSent = true">
            Pular
          </button>
          <button type="button" class="page-feedback__btn page-feedback__btn--primary" :disabled="!comment.trim()" @click="sendComment">
            Enviar
          </button>
        </div>
      </div>

      <div v-else key="done" class="page-feedback__done">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
        <span>Obrigado pelo feedback!</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.page-feedback {
  margin: 2.5rem 0 1rem;
  padding: 1rem 1.25rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  font-size: 0.9rem;
}

.page-feedback__row {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.page-feedback__row--end { justify-content: flex-end; }

.page-feedback__column {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.page-feedback__question {
  font-weight: 500;
  color: var(--vp-c-text-1);
}

.page-feedback__buttons { display: flex; gap: 0.5rem; }

.page-feedback__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.9rem;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-2);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.page-feedback__btn:hover:not(:disabled) {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.page-feedback__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-feedback__btn--primary {
  background: #289D8F;
  color: white;
  border-color: transparent;
}
.page-feedback__btn--primary:hover:not(:disabled) {
  background: #1d8b7e;
  color: white;
  border-color: transparent;
}

.page-feedback__btn--ghost {
  background: transparent;
}

.page-feedback__thanks {
  margin: 0;
  color: var(--vp-c-text-1);
  font-weight: 500;
}

.page-feedback__hint {
  color: var(--vp-c-text-3);
  font-weight: 400;
  font-size: 0.8rem;
}

.page-feedback__textarea {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-family: inherit;
  font-size: 0.875rem;
  resize: vertical;
  min-height: 70px;
}

.page-feedback__textarea:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}

.page-feedback__done {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--vp-c-brand-1);
  font-weight: 500;
}

.feedback-fade-enter-active,
.feedback-fade-leave-active {
  transition: opacity 0.2s ease;
}
.feedback-fade-enter-from,
.feedback-fade-leave-to {
  opacity: 0;
}
</style>
