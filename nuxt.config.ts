// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase'],
  supabase: {
    redirect: false,
    types: '~~/shared/types/database.ts',
    // Replaced automatically by NUXT_PUBLIC_SUPABASE_URL and
    // NUXT_PUBLIC_SUPABASE_KEY when a local .env file is present.
    url: 'https://placeholder.supabase.co',
    key: 'placeholder-anon-key'
  }
})
