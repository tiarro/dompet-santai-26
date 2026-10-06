<script setup lang="ts">
const user = useSupabaseUser()

if (!user.value) {
  await navigateTo('/login', { redirectCode: 302 })
}
</script>

<template>
  <!-- The dashboard is kept in a focused presentation component. -->
  <DashboardHome v-if="user" />
</template>
