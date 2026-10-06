<script setup lang="ts">
const user = useSupabaseUser()
useHead({ title: 'Riwayat - Dompet Santai' })
if (!user.value) await navigateTo('/login', { redirectCode: 302 })
</script>

<template>
  <DashboardHome v-if="user" section="history" />
</template>
