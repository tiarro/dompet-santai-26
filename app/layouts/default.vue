<template>
  <main class="app-shell">
    <slot />
  </main>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');
html { box-sizing: border-box; background: #fafbf8; }
*, *::before, *::after { box-sizing: inherit; }
body { min-width: 0; margin: 0; background: #fafbf8; transition: background .25s ease, color .25s ease; }
html.theme-dark, html.theme-dark body { background: #121615; }
button, input, textarea, select { font: inherit; }
.app-shell { min-height: 100vh; font-family: Manrope, Inter, ui-sans-serif, system-ui, sans-serif; }
.material-symbols-outlined { font-family: 'Material Symbols Outlined', sans-serif; font-weight: normal; font-style: normal; line-height: 1; white-space: nowrap; letter-spacing: normal; text-transform: none; direction: ltr; -webkit-font-feature-settings: 'liga'; -webkit-font-smoothing: antialiased; font-feature-settings: 'liga'; }
</style>
