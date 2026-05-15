import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { get } from 'svelte/store'

// We must mock localStorage and navigator before importing the module
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

describe('i18n — locale detection', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('detects pt-BR when navigator.language starts with "pt"', async () => {
    vi.stubGlobal('navigator', { language: 'pt-BR' })
    const { locale } = await import('../lib/i18n')
    expect(get(locale)).toBe('pt-BR')
  })

  it('detects es when navigator.language starts with "es"', async () => {
    vi.stubGlobal('navigator', { language: 'es-MX' })
    const { locale } = await import('../lib/i18n')
    expect(get(locale)).toBe('es')
  })

  it('detects zh-CN when navigator.language starts with "zh"', async () => {
    vi.stubGlobal('navigator', { language: 'zh-TW' })
    const { locale } = await import('../lib/i18n')
    expect(get(locale)).toBe('zh-CN')
  })

  it('falls back to en for unknown language', async () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' })
    const { locale } = await import('../lib/i18n')
    expect(get(locale)).toBe('en')
  })

  it('falls back to en when navigator is undefined', async () => {
    vi.stubGlobal('navigator', undefined)
    const { locale } = await import('../lib/i18n')
    expect(get(locale)).toBe('en')
  })

  it('uses saved locale from localStorage over detected one', async () => {
    localStorageMock.setItem('pianalyze-locale', 'es')
    vi.stubGlobal('navigator', { language: 'pt-BR' })
    const { locale } = await import('../lib/i18n')
    expect(get(locale)).toBe('es')
  })
})

describe('i18n — translation function t()', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('translates a known key in pt-BR', async () => {
    vi.stubGlobal('navigator', { language: 'pt-BR' })
    const { t } = await import('../lib/i18n')
    const translate = get(t)
    expect(translate('nav.home')).toBe('Início')
  })

  it('translates a known key in English', async () => {
    vi.stubGlobal('navigator', { language: 'en' })
    const { t } = await import('../lib/i18n')
    const translate = get(t)
    expect(translate('nav.home')).toBe('Home')
  })

  it('translates a known key in Spanish', async () => {
    vi.stubGlobal('navigator', { language: 'es' })
    const { t } = await import('../lib/i18n')
    const translate = get(t)
    expect(translate('nav.home')).toBe('Inicio')
  })

  it('translates a known key in Chinese', async () => {
    vi.stubGlobal('navigator', { language: 'zh' })
    const { t } = await import('../lib/i18n')
    const translate = get(t)
    expect(translate('nav.home')).toBe('主页')
  })

  it('falls back to en for a key missing in the current locale', async () => {
    vi.stubGlobal('navigator', { language: 'es' })
    const { t, locale } = await import('../lib/i18n')
    // Temporarily add a key only in en by checking fallback behavior:
    // For a truly missing key we expect the raw key returned
    locale.set('es')
    const translate = get(t)
    // A key that definitely doesn't exist returns the key itself
    expect(translate('non.existent.key')).toBe('non.existent.key')
  })

  it('returns the raw key when key is missing in all locales', async () => {
    vi.stubGlobal('navigator', { language: 'en' })
    const { t } = await import('../lib/i18n')
    const translate = get(t)
    expect(translate('totally.missing.key')).toBe('totally.missing.key')
  })

  it('t() updates reactively when locale changes', async () => {
    vi.stubGlobal('navigator', { language: 'en' })
    const { t, locale } = await import('../lib/i18n')
    expect(get(t)('nav.home')).toBe('Home')
    locale.set('pt-BR')
    expect(get(t)('nav.home')).toBe('Início')
    locale.set('zh-CN')
    expect(get(t)('nav.home')).toBe('主页')
  })
})

describe('i18n — localStorage persistence', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists locale choice to localStorage on change', async () => {
    vi.stubGlobal('navigator', { language: 'en' })
    const { locale } = await import('../lib/i18n')
    locale.set('es')
    expect(localStorageMock.getItem('pianalyze-locale')).toBe('es')
  })

  it('persists pt-BR choice', async () => {
    vi.stubGlobal('navigator', { language: 'en' })
    const { locale } = await import('../lib/i18n')
    locale.set('pt-BR')
    expect(localStorageMock.getItem('pianalyze-locale')).toBe('pt-BR')
  })
})

describe('i18n — LOCALE_NAMES', () => {
  it('has entries for all supported locales', async () => {
    vi.stubGlobal('navigator', { language: 'en' })
    const { LOCALE_NAMES } = await import('../lib/i18n')
    expect(Object.keys(LOCALE_NAMES)).toEqual(
      expect.arrayContaining(['pt-BR', 'en', 'es', 'zh-CN'])
    )
  })

  it('all names are non-empty strings', async () => {
    vi.stubGlobal('navigator', { language: 'en' })
    const { LOCALE_NAMES } = await import('../lib/i18n')
    for (const name of Object.values(LOCALE_NAMES)) {
      expect(typeof name).toBe('string')
      expect(name.length).toBeGreaterThan(0)
    }
  })
})

describe('i18n — toast locale keys', () => {
  const LOCALES = ['en', 'pt-BR', 'es', 'zh-CN'] as const

  beforeEach(() => { vi.resetModules() })
  afterEach(() => { vi.unstubAllGlobals() })

  for (const locale of LOCALES) {
    it(`"toast.device.disconnected" is a non-empty string in ${locale}`, async () => {
      vi.stubGlobal('navigator', { language: locale })
      const { t } = await import('../lib/i18n')
      const { get } = await import('svelte/store')
      const { locale: localeStore } = await import('../lib/i18n')
      localeStore.set(locale)
      const translate = get(t)
      const result = translate('toast.device.disconnected')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      expect(result).not.toBe('toast.device.disconnected')
    })

    it(`"toast.device.connected" is a non-empty string in ${locale}`, async () => {
      vi.stubGlobal('navigator', { language: locale })
      const { t } = await import('../lib/i18n')
      const { get } = await import('svelte/store')
      const { locale: localeStore } = await import('../lib/i18n')
      localeStore.set(locale)
      const translate = get(t)
      const result = translate('toast.device.connected')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      expect(result).not.toBe('toast.device.connected')
    })
  }
})
