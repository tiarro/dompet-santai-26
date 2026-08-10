<script setup lang="ts">
defineProps<{
  error: {
    statusCode?: number
    statusMessage?: string
  }
}>()
</script>

<template>
  <main class="error-page">
    <p>{{ error.statusCode || 500 }}</p>
    <h1>{{ error.statusMessage || 'Terjadi kesalahan.' }}</h1>
    <NuxtLink to="/">Kembali ke Dompet Santai</NuxtLink>
  </main>
</template>

<style scoped>
.error-page { min-height: 100vh; display: grid; place-content: center; gap: 1rem; padding: 2rem; font-family: system-ui, sans-serif; }
p { color: #0f766e; font-weight: 700; margin: 0; }
h1 { margin: 0; }
</style>
