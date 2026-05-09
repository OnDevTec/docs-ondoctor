<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import ConsentBanner from './components/ConsentBanner.vue'
import ManageCookiesButton from './components/ManageCookiesButton.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #layout-bottom>
      <ManageCookiesButton />
      <ConsentBanner />
    </template>
  </Layout>
</template>
