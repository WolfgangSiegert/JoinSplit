export const LANGUAGE_PREFERENCES = ['system', 'de', 'en'] as const

export type LanguagePreference = typeof LANGUAGE_PREFERENCES[number]
export type AppLocale = Exclude<LanguagePreference, 'system'>

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return typeof value === 'string' && LANGUAGE_PREFERENCES.includes(value as LanguagePreference)
}

export function detectSystemLocale(languages: readonly string[] = []): AppLocale {
  for (const language of languages) {
    const normalized = language.trim().toLowerCase().split('-')[0]
    if (normalized === 'de' || normalized === 'en') return normalized
  }
  return 'en'
}

export function resolveLocale(preference: LanguagePreference, systemLocale: AppLocale): AppLocale {
  return preference === 'system' ? systemLocale : preference
}
