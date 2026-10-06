<script setup lang="ts">
const { theme, toggleTheme } = useTheme()

const label = computed(() => theme.value === 'dark' ? 'Gunakan mode terang' : 'Gunakan mode gelap')
const icon = computed(() => theme.value === 'dark' ? 'light_mode' : 'dark_mode')
</script>

<template>
  <button class="theme-toggle" :aria-label="label" :title="label" type="button" @click="toggleTheme">
    <span class="theme-toggle__orb"><span class="material-symbols-outlined">{{ icon }}</span></span>
  </button>
</template>

<style scoped>
.theme-toggle { display: grid; width: 2.5rem; height: 2.5rem; padding: 0; place-items: center; border: 1px solid transparent; border-radius: 999px; color: #3d4947; background: transparent; cursor: pointer; transition: background .2s ease, color .2s ease, transform .2s ease; }
.theme-toggle:hover { background: #e8efec; transform: translateY(-1px); }.theme-toggle:focus-visible { outline: 2px solid #006a61; outline-offset: 2px; }.theme-toggle__orb { display: grid; width: 1.8rem; height: 1.8rem; place-items: center; border-radius: 999px; transition: transform .3s ease, background .3s ease; }.material-symbols-outlined { font-size: 1.2rem; }
html.theme-dark .theme-toggle { color: #d8f3ec; }.theme-toggle:hover .theme-toggle__orb { background: #d6f1ea; color: #005149; }html.theme-dark .theme-toggle:hover { background: #293431; }html.theme-dark .theme-toggle:hover .theme-toggle__orb { background: #29443e; color: #bcf4e8; transform: rotate(20deg); }
</style>
