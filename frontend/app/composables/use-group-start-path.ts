import { groupAreaPath } from '../domain/group-area'

export function useGroupStartPath() {
  const settingsStore = useSettingsStore()

  function groupStartPath(groupId: string): string {
    return groupAreaPath(groupId, settingsStore.defaultGroupArea)
  }

  return { groupStartPath }
}
