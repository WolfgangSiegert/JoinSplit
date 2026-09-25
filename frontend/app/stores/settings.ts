import { defineStore } from 'pinia'
import { ref } from 'vue'
import { persistSettings, type DurableSettings } from '../persistence/database'

export const useSettingsStore = defineStore('settings', () => {
  const addSelfAsParticipantByDefault = ref(true)
  const settlementProposalStrategy = ref<DurableSettings['settlementProposalStrategy']>('deterministic')
  const colorMode = ref<DurableSettings['colorMode']>('system')
  const visualDesign = ref<DurableSettings['visualDesign']>('2')

  function currentSettings(overrides: Partial<DurableSettings> = {}): DurableSettings {
    return {
      addSelfAsParticipantByDefault: addSelfAsParticipantByDefault.value,
      settlementProposalStrategy: settlementProposalStrategy.value,
      colorMode: colorMode.value,
      visualDesign: visualDesign.value,
      ...overrides,
    }
  }

  function hydrate(settings: DurableSettings | null): void {
    addSelfAsParticipantByDefault.value = settings?.addSelfAsParticipantByDefault ?? true
    settlementProposalStrategy.value = settings?.settlementProposalStrategy ?? 'deterministic'
    colorMode.value = settings?.colorMode ?? 'system'
    visualDesign.value = settings?.visualDesign ?? '2'
  }

  async function setAddSelfAsParticipantByDefault(value: boolean): Promise<void> {
    await persistSettings(currentSettings({ addSelfAsParticipantByDefault: value }))
    addSelfAsParticipantByDefault.value = value
  }

  async function setSettlementProposalStrategy(value: DurableSettings['settlementProposalStrategy']): Promise<void> {
    await persistSettings(currentSettings({ settlementProposalStrategy: value }))
    settlementProposalStrategy.value = value
  }

  async function setColorMode(value: DurableSettings['colorMode']): Promise<void> {
    await persistSettings(currentSettings({ colorMode: value }))
    colorMode.value = value
  }

  async function setVisualDesign(value: DurableSettings['visualDesign']): Promise<void> {
    await persistSettings(currentSettings({ visualDesign: value }))
    visualDesign.value = value
  }

  return {
    addSelfAsParticipantByDefault,
    settlementProposalStrategy,
    colorMode,
    visualDesign,
    hydrate,
    setAddSelfAsParticipantByDefault,
    setSettlementProposalStrategy,
    setColorMode,
    setVisualDesign,
  }
})
