// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase'],
  supabase: {
    redirect: false,
    types: '~~/shared/types/database.ts',
    // Resolve environment values before falling back to demo configuration.
    url: process.env.NUXT_PUBLIC_SUPABASE_URL
      || process.env.SUPABASE_URL
      || 'https://placeholder.supabase.co',
    key: process.env.NUXT_PUBLIC_SUPABASE_KEY
      || process.env.SUPABASE_KEY
      || process.env.SUPABASE_PUBLISHABLE_KEY
      || process.env.SUPABASE_ANON_KEY
      || 'placeholder-anon-key'
  }
})
