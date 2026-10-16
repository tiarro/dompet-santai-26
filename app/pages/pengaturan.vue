<script setup lang="ts">
const user = useSupabaseUser()
useHead({ title: 'Pengaturan - Dompet Santai' })
if (!user.value) await navigateTo('/login', { redirectCode: 302 })
watch(user, value => { if (!value) navigateTo('/login') })
</script>
<template><DashboardHome v-if="user" section="settings" /></template>
