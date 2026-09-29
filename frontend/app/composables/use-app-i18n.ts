import type { MessageKey } from '../i18n/messages'
import { translate } from '../i18n/messages'

export function useAppI18n() {
  const settingsStore = useSettingsStore()
  const locale = computed(() => settingsStore.resolvedLocale)
  const t = (key: MessageKey, params?: Readonly<Record<string, string | number>>): string => translate(locale.value, key, params)
  return { locale, t }
}
