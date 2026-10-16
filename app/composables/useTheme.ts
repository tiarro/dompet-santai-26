import { useCloudFinance } from './useCloudFinance'
import { defaultTheme } from '~/utils/settings'

export type Theme = 'light' | 'dark'

export function useTheme() {
  const user = useSupabaseUser()
  const cloud = useCloudFinance()
  const theme = useState<Theme>('dashboard-theme', () => defaultTheme)
  const preference = ref<'light' | 'dark' | 'system'>(defaultTheme)
  let media: MediaQueryList | undefined

  function apply() {
    theme.value = preference.value === 'system' ? (media?.matches ? 'dark' : 'light') : preference.value
    document.documentElement.classList.toggle('theme-dark', theme.value === 'dark')
    document.documentElement.style.colorScheme = theme.value
  }

  function refresh() {
    try {
      const raw = user.value?.sub ? cloud.data.value.settings : null
      preference.value = raw?.theme ?? (localStorage.getItem('dompet-santai-theme') as typeof preference.value) ?? defaultTheme
      if (!['light', 'dark', 'system'].includes(preference.value)) preference.value = defaultTheme
      apply()
    } catch {
      // Keep the current theme if browser storage or cloud state is unavailable.
      apply()
    }
  }

  async function setPreference(value: typeof preference.value) {
    const owner = user.value?.sub
    if (owner) {
      if (!cloud.ready.value) throw new Error(cloud.error.value || 'Pengaturan belum siap.')
      await cloud.save({
        ...cloud.data.value,
        settings: { ...cloud.data.value.settings, theme: value, revision: cloud.data.value.settings.revision + 1 },
      })
    } else {
      localStorage.setItem('dompet-santai-theme', value)
    }
    preference.value = value
    apply()
  }

  const toggleTheme = () => setPreference(theme.value === 'dark' ? 'light' : 'dark')

  onMounted(() => {
    media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    const stop = watch([() => user.value?.sub, () => cloud.data.value.settings.theme], refresh, { immediate: true })
    onBeforeUnmount(() => {
      stop()
      media?.removeEventListener('change', apply)
    })
  })

  return { theme, preference, setPreference, toggleTheme }
}

