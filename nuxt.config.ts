// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  runtimeConfig: {
    profileStorage: {
      url: process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
      secretKey: process.env.SUPABASE_SECRET_KEY || ''
    }
  },
  modules: ['@nuxtjs/supabase', '@vite-pwa/nuxt'],
  supabase: {
    redirect: false,
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
    },
    types: '~~/shared/types/database.ts',
    url: process.env.NUXT_PUBLIC_SUPABASE_URL
      || process.env.SUPABASE_URL
      || 'https://placeholder.supabase.co',
    key: process.env.NUXT_PUBLIC_SUPABASE_KEY
      || process.env.SUPABASE_KEY
      || process.env.SUPABASE_PUBLISHABLE_KEY
      || process.env.SUPABASE_ANON_KEY
      || 'placeholder-anon-key'
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Dompet Santai',
      short_name: 'Dompet Santai',
      description: 'Catatan keuangan pribadi yang sederhana.',
      lang: 'id',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#fafbf8',
      theme_color: '#0f766e',
      icons: [
        { src: '/pwa.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
      ],
    },
    strategies: 'injectManifest',
    // Nuxt's source directory is `app/`; the worker lives at the repository
    // root so the PWA module must resolve one level up.
    srcDir: '../service-worker',
    filename: 'sw.ts',
    includeAssets: ['offline.html', 'pwa.svg'],
    injectManifest: {
      globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
    },
    devOptions: {
      enabled: false,
    },
  },
})

