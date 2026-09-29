export const GROUP_AREAS = ['people', 'expenses', 'settlement'] as const

export type GroupArea = typeof GROUP_AREAS[number]

export const DEFAULT_GROUP_AREA_ORDER: readonly GroupArea[] = GROUP_AREAS

export function isGroupAreaOrder(value: unknown): value is readonly GroupArea[] {
  return Array.isArray(value)
    && value.length === GROUP_AREAS.length
    && value.every(area => GROUP_AREAS.includes(area as GroupArea))
    && new Set(value).size === GROUP_AREAS.length
}

export const GROUP_AREA_PRESENTATION: Readonly<Record<GroupArea, {
  label: string
  icon: 'receipt' | 'scale' | 'users'
}>> = Object.freeze({
  expenses: { label: 'Ausgaben', icon: 'receipt' },
  settlement: { label: 'Ausgleich', icon: 'scale' },
  people: { label: 'Leute', icon: 'users' },
})
