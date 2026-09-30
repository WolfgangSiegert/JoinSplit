import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { persistSettings, type DurableSettings } from '../persistence/database'
import { DEFAULT_GROUP_AREA, DEFAULT_GROUP_AREA_ORDER, isGroupArea, isGroupAreaOrder, type GroupArea } from '../domain/group-area'
import { detectSystemLocale, resolveLocale, type AppLocale, type LanguagePreference } from '../domain/locale'

export const useSettingsStore = defineStore('settings', () => {
  const addSelfAsParticipantByDefault = ref(true)
  const defaultParticipantName = ref('')
  const settlementProposalStrategy = ref<DurableSettings['settlementProposalStrategy']>('deterministic')
  const settlementRecordingEnabled = ref(false)
  const settlementRecordingGroupIds = ref<string[]>([])
  const colorMode = ref<DurableSettings['colorMode']>('system')
  const visualDesign = ref<DurableSettings['visualDesign']>('2')
  const groupAreaOrder = ref<GroupArea[]>([...DEFAULT_GROUP_AREA_ORDER])
  const defaultGroupArea = ref<GroupArea>(DEFAULT_GROUP_AREA)
  const languagePreference = ref<LanguagePreference>('system')
  const systemLocale = ref<AppLocale>('en')
  const resolvedLocale = computed(() => resolveLocale(languagePreference.value, systemLocale.value))

  function currentSettings(overrides: Partial<DurableSettings> = {}): DurableSettings {
    return {
      addSelfAsParticipantByDefault: addSelfAsParticipantByDefault.value,
      defaultParticipantName: defaultParticipantName.value,
      settlementProposalStrategy: settlementProposalStrategy.value,
      settlementRecordingEnabled: settlementRecordingEnabled.value,
      settlementRecordingGroupIds: [...settlementRecordingGroupIds.value],
      colorMode: colorMode.value,
      visualDesign: visualDesign.value,
      groupAreaOrder: [...groupAreaOrder.value],
      defaultGroupArea: defaultGroupArea.value,
      languagePreference: languagePreference.value,
      ...overrides,
    }
  }

  function hydrate(settings: DurableSettings | null): void {
    addSelfAsParticipantByDefault.value = settings?.addSelfAsParticipantByDefault ?? true
    defaultParticipantName.value = settings?.defaultParticipantName ?? ''
    settlementProposalStrategy.value = settings?.settlementProposalStrategy ?? 'deterministic'
    settlementRecordingEnabled.value = settings?.settlementRecordingEnabled ?? false
    settlementRecordingGroupIds.value = [...(settings?.settlementRecordingGroupIds ?? [])]
    colorMode.value = settings?.colorMode ?? 'system'
    visualDesign.value = settings?.visualDesign ?? '2'
    groupAreaOrder.value = isGroupAreaOrder(settings?.groupAreaOrder)
      ? [...settings.groupAreaOrder]
      : [...DEFAULT_GROUP_AREA_ORDER]
    defaultGroupArea.value = isGroupArea(settings?.defaultGroupArea)
      ? settings.defaultGroupArea
      : DEFAULT_GROUP_AREA
    languagePreference.value = settings?.languagePreference ?? 'system'
  }

  async function setAddSelfAsParticipantByDefault(value: boolean): Promise<void> {
    await persistSettings(currentSettings({ addSelfAsParticipantByDefault: value }))
    addSelfAsParticipantByDefault.value = value
  }

  async function setDefaultParticipantName(value: string): Promise<void> {
    const normalized = value.trim().replace(/\s+/gu, ' ')
    if ([...normalized].length > 100) throw new Error('Default participant name is too long')
    await persistSettings(currentSettings({ defaultParticipantName: normalized }))
    defaultParticipantName.value = normalized
  }

  async function setSettlementProposalStrategy(value: DurableSettings['settlementProposalStrategy']): Promise<void> {
    await persistSettings(currentSettings({ settlementProposalStrategy: value }))
    settlementProposalStrategy.value = value
  }

  function isSettlementRecordingEnabled(groupId: string): boolean {
    return settlementRecordingEnabled.value || settlementRecordingGroupIds.value.includes(groupId)
  }

  async function setSettlementRecordingEnabled(value: boolean): Promise<void> {
    await persistSettings(currentSettings({ settlementRecordingEnabled: value }))
    settlementRecordingEnabled.value = value
  }

  async function enableSettlementRecordingForGroup(groupId: string): Promise<void> {
    if (settlementRecordingGroupIds.value.includes(groupId)) return
    const groupIds = [...settlementRecordingGroupIds.value, groupId]
    await persistSettings(currentSettings({ settlementRecordingGroupIds: groupIds }))
    settlementRecordingGroupIds.value = groupIds
  }

  async function disableSettlementRecordingForGroup(groupId: string): Promise<void> {
    if (!settlementRecordingGroupIds.value.includes(groupId)) return
    const groupIds = settlementRecordingGroupIds.value.filter(id => id !== groupId)
    await persistSettings(currentSettings({ settlementRecordingGroupIds: groupIds }))
    settlementRecordingGroupIds.value = groupIds
  }

  async function setColorMode(value: DurableSettings['colorMode']): Promise<void> {
    await persistSettings(currentSettings({ colorMode: value }))
    colorMode.value = value
  }

  async function setVisualDesign(value: DurableSettings['visualDesign']): Promise<void> {
    await persistSettings(currentSettings({ visualDesign: value }))
    visualDesign.value = value
  }

  async function setGroupAreaOrder(value: readonly GroupArea[]): Promise<void> {
    if (!isGroupAreaOrder(value)) throw new Error('Invalid group area order')
    const normalized = [...value]
    await persistSettings(currentSettings({ groupAreaOrder: normalized }))
    groupAreaOrder.value = normalized
  }

  async function setDefaultGroupArea(value: GroupArea): Promise<void> {
    if (!isGroupArea(value)) throw new Error('Invalid default group area')
    await persistSettings(currentSettings({ defaultGroupArea: value }))
    defaultGroupArea.value = value
  }

  function detectLanguage(languages: readonly string[]): void {
    systemLocale.value = detectSystemLocale(languages)
  }

  async function setLanguagePreference(value: LanguagePreference): Promise<void> {
    await persistSettings(currentSettings({ languagePreference: value }))
    languagePreference.value = value
  }

  async function applyAccountPreferences(value: { readonly groupAreaOrder: readonly GroupArea[]; readonly defaultGroupArea: GroupArea; readonly languagePreference: LanguagePreference }): Promise<void> {
    if (!isGroupAreaOrder(value.groupAreaOrder)) throw new Error('Invalid group area order')
    if (!isGroupArea(value.defaultGroupArea)) throw new Error('Invalid default group area')
    await persistSettings(currentSettings({
      groupAreaOrder: [...value.groupAreaOrder],
      defaultGroupArea: value.defaultGroupArea,
      languagePreference: value.languagePreference,
    }))
    groupAreaOrder.value = [...value.groupAreaOrder]
    defaultGroupArea.value = value.defaultGroupArea
    languagePreference.value = value.languagePreference
  }

  return {
    addSelfAsParticipantByDefault,
    defaultParticipantName,
    settlementProposalStrategy,
    settlementRecordingEnabled,
    settlementRecordingGroupIds,
    colorMode,
    visualDesign,
    groupAreaOrder,
    defaultGroupArea,
    languagePreference,
    resolvedLocale,
    hydrate,
    setAddSelfAsParticipantByDefault,
    setDefaultParticipantName,
    setSettlementProposalStrategy,
    isSettlementRecordingEnabled,
    setSettlementRecordingEnabled,
    enableSettlementRecordingForGroup,
    disableSettlementRecordingForGroup,
    setColorMode,
    setVisualDesign,
    setGroupAreaOrder,
    setDefaultGroupArea,
    detectLanguage,
    setLanguagePreference,
    applyAccountPreferences,
  }
})
