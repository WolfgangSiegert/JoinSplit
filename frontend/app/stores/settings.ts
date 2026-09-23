import { defineStore } from 'pinia'
import { ref } from 'vue'
import { persistSettings, type DurableSettings } from '../persistence/database'

export const useSettingsStore = defineStore('settings', () => {
  const addSelfAsParticipantByDefault = ref(true)

  function hydrate(settings: DurableSettings | null): void {
    addSelfAsParticipantByDefault.value = settings?.addSelfAsParticipantByDefault ?? true
  }

  async function setAddSelfAsParticipantByDefault(value: boolean): Promise<void> {
    await persistSettings({ addSelfAsParticipantByDefault: value })
    addSelfAsParticipantByDefault.value = value
  }

  return {
    addSelfAsParticipantByDefault,
    hydrate,
    setAddSelfAsParticipantByDefault,
  }
})
