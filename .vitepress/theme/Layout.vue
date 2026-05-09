<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import Breadcrumbs from './components/Breadcrumbs.vue'
import ConsentBanner from './components/ConsentBanner.vue'
import ManageCookiesButton from './components/ManageCookiesButton.vue'
import PageFeedback from './components/PageFeedback.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #doc-before>
      <Breadcrumbs />
    </template>
    <template #doc-after>
      <PageFeedback />
    </template>
    <template #layout-bottom>
      <ManageCookiesButton />
      <ConsentBanner />
    </template>
  </Layout>
</template>
