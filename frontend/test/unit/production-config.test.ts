import { describe, expect, test } from 'vitest'
import { productionConfigurationErrors } from '../../server/utils/production-config'

describe('production configuration boundary', () => {
  test('accepts only the canonical same-origin production configuration', () => {
    expect(productionConfigurationErrors({
      JOIN_SPLIT_VALIDATE_PRODUCTION: 'true',
      JOIN_SPLIT_CANONICAL_ORIGIN: 'https://joinsplit.tiny-bits.org',
      NUXT_PUBLIC_API_BASE: 'https://joinsplit.tiny-bits.org',
      NODE_ENV: 'production',
    })).toEqual([])
  })

  test.each([
    ['http://joinsplit.tiny-bits.org', 'https://joinsplit.tiny-bits.org', 'JOIN_SPLIT_CANONICAL_ORIGIN'],
    ['https://joinsplit.tiny-bits.org', 'http://127.0.0.1:8000', 'NUXT_PUBLIC_API_BASE'],
    ['https://joinsplit.tiny-bits.org/path', 'https://joinsplit.tiny-bits.org', 'JOIN_SPLIT_CANONICAL_ORIGIN'],
  ])('rejects unsafe or differing origins', (canonical, api, expectedError) => {
    expect(productionConfigurationErrors({
      JOIN_SPLIT_VALIDATE_PRODUCTION: 'true',
      JOIN_SPLIT_CANONICAL_ORIGIN: canonical,
      NUXT_PUBLIC_API_BASE: api,
      NODE_ENV: 'production',
    })).toContain(expectedError)
  })

  test('does not impose production values on local and test runtimes', () => {
    expect(productionConfigurationErrors({})).toEqual([])
  })
})
