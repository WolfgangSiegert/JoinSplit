import { defineStore } from 'pinia'
import { ref } from 'vue'
import { persistSettings, type DurableSettings } from '../persistence/database'

export const useSettingsStore = defineStore('settings', () => {
  const addSelfAsParticipantByDefault = ref(true)
  const settlementProposalStrategy = ref<DurableSettings['settlementProposalStrategy']>('deterministic')

  function hydrate(settings: DurableSettings | null): void {
    addSelfAsParticipantByDefault.value = settings?.addSelfAsParticipantByDefault ?? true
    settlementProposalStrategy.value = settings?.settlementProposalStrategy ?? 'deterministic'
  }

  async function setAddSelfAsParticipantByDefault(value: boolean): Promise<void> {
    await persistSettings({ addSelfAsParticipantByDefault: value, settlementProposalStrategy: settlementProposalStrategy.value })
    addSelfAsParticipantByDefault.value = value
  }

  async function setSettlementProposalStrategy(value: DurableSettings['settlementProposalStrategy']): Promise<void> {
    await persistSettings({ addSelfAsParticipantByDefault: addSelfAsParticipantByDefault.value, settlementProposalStrategy: value })
    settlementProposalStrategy.value = value
  }

  return {
    addSelfAsParticipantByDefault,
    settlementProposalStrategy,
    hydrate,
    setAddSelfAsParticipantByDefault,
    setSettlementProposalStrategy,
  }
})
