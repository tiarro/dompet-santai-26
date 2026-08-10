<template>
  <main class="app-shell">
    <slot />
  </main>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  padding: 2rem;
  background: #f7f7f2;
  color: #1f2937;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
</style>
