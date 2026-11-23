<script setup lang="ts">
useHead({
  title: 'Atur Ulang Kata Sandi - Dompet Santai',
  meta: [
    { name: 'robots', content: 'noindex, nofollow' },
    { name: 'referrer', content: 'no-referrer' },
  ],
})
if (import.meta.server) useResponseHeader('Cache-Control').value = 'no-store'
</script>

<template>
  <ResetPasswordPage />
</template>
