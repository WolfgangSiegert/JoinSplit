import { describe, expect, test } from 'vitest'
import {
  canApplyPwaUpdate,
  pendingMutationLabel,
  pendingMutationVerb,
} from '../../app/utils/pwa-update'

describe('PWA update safety', () => {
  test('allows a safe update without pending work', () => {
    expect(canApplyPwaUpdate(0, false)).toBe(true)
  })

  test('requires explicit risk acceptance while local mutations are pending', () => {
    expect(canApplyPwaUpdate(1, false)).toBe(false)
    expect(canApplyPwaUpdate(4, false)).toBe(false)
    expect(canApplyPwaUpdate(4, true)).toBe(true)
  })

  test('provides singular and plural copy without hiding the exact count', () => {
    expect(pendingMutationLabel(1)).toBe('eine lokale Änderung')
    expect(pendingMutationVerb(1, 'ist', 'sind')).toBe('ist')
    expect(pendingMutationLabel(3)).toBe('3 lokale Änderungen')
    expect(pendingMutationVerb(3, 'ist', 'sind')).toBe('sind')
  })
})
