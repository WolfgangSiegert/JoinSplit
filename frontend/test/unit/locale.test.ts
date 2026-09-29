import { describe, expect, test } from 'vitest'
import { detectSystemLocale, resolveLocale } from '../../app/domain/locale'
import { translate } from '../../app/i18n/messages'

describe('application locale', () => {
  test('uses the first supported system language and falls back to English', () => {
    expect(detectSystemLocale(['fr-FR', 'de-DE', 'en-US'])).toBe('de')
    expect(detectSystemLocale(['fr-FR'])).toBe('en')
    expect(detectSystemLocale([])).toBe('en')
  })

  test('resolves explicit preferences independently of the system language', () => {
    expect(resolveLocale('system', 'de')).toBe('de')
    expect(resolveLocale('en', 'de')).toBe('en')
  })

  test('translates and interpolates application messages', () => {
    expect(translate('en', 'settings.tabs.up', { label: 'People' })).toBe('Move People up')
    expect(translate('de', 'settings.groups.addNamed', { name: 'Ada' })).toContain('Ada')
  })
})
