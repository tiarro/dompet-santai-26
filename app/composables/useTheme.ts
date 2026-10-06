export type Theme = 'light' | 'dark'

const storageKey = 'dompet-santai-theme'

export function useTheme() {
  const theme = useState<Theme>('dashboard-theme', () => 'light')

  const applyTheme = (nextTheme: Theme) => {
    document.documentElement.classList.toggle('theme-dark', nextTheme === 'dark')
    document.documentElement.style.colorScheme = nextTheme
  }

  const toggleTheme = () => {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    applyTheme(theme.value)
    localStorage.setItem(storageKey, theme.value)
  }

  onMounted(() => {
    const savedTheme = localStorage.getItem(storageKey) as Theme | null
    const preferredTheme: Theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

    theme.value = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : preferredTheme
    applyTheme(theme.value)
  })

  return { theme, toggleTheme }
}
