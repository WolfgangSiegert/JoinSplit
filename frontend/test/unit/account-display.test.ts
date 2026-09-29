import { describe, expect, test } from 'vitest'
import { accountInitials } from '../../app/domain/account-display'

describe('account display initials', () => {
  test('uses at most the first two name initials', () => {
    expect(accountInitials('Ada Lovelace Byron', 'owner@example.test')).toBe('AL')
    expect(accountInitials('Wolfgang', 'owner@example.test')).toBe('WO')
  })

  test('falls back to the local part of the email address', () => {
    expect(accountInitials(null, 'ada.lovelace@example.test')).toBe('AL')
    expect(accountInitials('  ', 'x@example.test')).toBe('X')
  })
})
