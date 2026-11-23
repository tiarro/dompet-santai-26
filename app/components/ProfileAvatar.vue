<script setup lang="ts">
const props = defineProps<{ src: string; alt: string }>()
const failed = ref(false)
watch(() => props.src, () => { failed.value = false }, { flush: 'sync' })
</script>

<template>
  <img :src="failed ? '/avatar-default.svg' : src" :alt="alt" @error="failed = true">
</template>
