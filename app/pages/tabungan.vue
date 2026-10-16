<script setup lang="ts">
const user = useSupabaseUser()
useHead({ title: 'Tabungan - Dompet Santai' })
if (!user.value) await navigateTo('/login', { redirectCode: 302 })
</script>
<template><DashboardHome v-if="user" section="savings" /></template>
