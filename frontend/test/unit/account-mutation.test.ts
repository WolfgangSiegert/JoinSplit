import { describe, expect, test } from 'vitest'
import { accountMutationAuthorizationError } from '../../app/services/account-mutation'

describe('Account mutation authorization errors', () => {
  test('distinguishes an expired Account session from an anonymous credential rejection', () => {
    expect(accountMutationAuthorizationError(new Response(null, { status: 401 }), true, 'Die Ausgabe'))
      .toMatchObject({ kind: 'session-expired', retryable: false })
    expect(accountMutationAuthorizationError(new Response(null, { status: 401 }), false, 'Die Ausgabe'))
      .toMatchObject({ kind: 'unauthorized', retryable: false })
  })

  test('keeps forbidden and missing server resources distinct', () => {
    expect(accountMutationAuthorizationError(new Response(null, { status: 403 }), true, 'Die Gruppe'))
      .toMatchObject({ kind: 'forbidden' })
    expect(accountMutationAuthorizationError(new Response(null, { status: 404 }), true, 'Die Gruppe'))
      .toMatchObject({ kind: 'not-found' })
  })
})
