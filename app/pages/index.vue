<script setup lang="ts">
const appConfig = useAppConfig()
</script>

<template>
  <section class="dashboard">
    <p class="eyebrow">Catatan keuangan pribadi</p>
    <h1 data-testid="page-title">{{ appConfig.appName }}</h1>
    <p class="intro">
      Proyek Nuxt 4 dengan Supabase dan fondasi pengujian yang siap dikembangkan.
    </p>
    <div class="cards">
      <article>
        <span>Database</span>
        <strong>Supabase</strong>
      </article>
      <article>
        <span>Unit test</span>
        <strong>Vitest</strong>
      </article>
      <article>
        <span>E2E test</span>
        <strong>Playwright</strong>
      </article>
    </div>
  </section>
</template>

<style scoped>
.dashboard { max-width: 52rem; margin: 8vh auto; }
.eyebrow { color: #0f766e; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; font-size: .75rem; }
h1 { margin: .25rem 0; font-size: clamp(2.5rem, 8vw, 5rem); }
.intro { max-width: 40rem; font-size: 1.125rem; line-height: 1.6; }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 2rem; }
article { padding: 1.25rem; border-radius: 1rem; background: #fff; box-shadow: 0 8px 24px rgb(15 23 42 / 8%); }
span { display: block; color: #64748b; font-size: .875rem; }
strong { display: block; margin-top: .5rem; font-size: 1.25rem; }
@media (max-width: 600px) { .app-shell { padding: 1.25rem; } .cards { grid-template-columns: 1fr; } }
</style>
