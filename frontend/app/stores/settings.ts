import { defineStore } from 'pinia'

export const useSettingsStore = defineStore('settings', () => {
  const addSelfAsParticipantByDefault = ref(true)

  return { addSelfAsParticipantByDefault }
})
