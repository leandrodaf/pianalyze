import { writable, derived } from 'svelte/store'
import ptBR from './locales/pt-BR.json'
import en from './locales/en.json'
import es from './locales/es.json'
import zhCN from './locales/zh-CN.json'

export type Locale = 'pt-BR' | 'en' | 'es' | 'zh-CN'

export const LOCALE_NAMES: Record<Locale, string> = {
  'pt-BR': 'Português (BR)',
  'en': 'English',
  'es': 'Español',
  'zh-CN': '中文（简体）',
}

const MESSAGES: Record<Locale, Record<string, string>> = { 'pt-BR': ptBR, en, es, 'zh-CN': zhCN }

function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  const lang = navigator.language ?? ''
  if (lang.startsWith('pt')) return 'pt-BR'
  if (lang.startsWith('es')) return 'es'
  if (lang.startsWith('zh')) return 'zh-CN'
  return 'en'
}

function loadSaved(): Locale | null {
  try {
    const v = localStorage.getItem('pianalyze-locale')
    if (v && v in MESSAGES) return v as Locale
  } catch { /* ignore */ }
  return null
}

export const locale = writable<Locale>(loadSaved() ?? detectLocale())

// Persist choice
locale.subscribe(v => {
  try { localStorage.setItem('pianalyze-locale', v) } catch { /* ignore */ }
})

export const t = derived(locale, $locale => {
  const msgs = MESSAGES[$locale]
  const fallback = MESSAGES['en']
  return (key: string): string => msgs[key] ?? fallback[key] ?? key
})

/** Returns the best available localized text for an exercise field. */
export function localText(
  i18n: Record<string, { title?: string; subtitle?: string; description?: string }> | undefined,
  field: 'title' | 'subtitle' | 'description',
  fallback: string,
  currentLocale: Locale,
): string {
  if (!i18n) return fallback
  return i18n[currentLocale]?.[field] ?? i18n['en']?.[field] ?? fallback
}
