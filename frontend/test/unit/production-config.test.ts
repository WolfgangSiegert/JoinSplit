import { describe, expect, test } from 'vitest'
import { backendProxyTarget, productionConfigurationErrors } from '../../server/utils/production-config'

describe('production configuration boundary', () => {
  test('accepts only the canonical same-origin production configuration', () => {
    expect(productionConfigurationErrors({
      JOIN_SPLIT_VALIDATE_PRODUCTION: 'true',
      JOIN_SPLIT_CANONICAL_ORIGIN: 'https://joinsplit.tiny-bits.org',
      NUXT_PUBLIC_API_BASE: 'https://joinsplit.tiny-bits.org',
      JOIN_SPLIT_BACKEND_HOSTPORT: 'joinsplit-backend:10000',
      NUXT_PUBLIC_OPERATOR_NAME: 'Approved Operator',
      NUXT_PUBLIC_PRIVACY_CONTACT_URL: 'mailto:privacy@example.test',
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
      JOIN_SPLIT_BACKEND_HOSTPORT: 'joinsplit-backend:10000',
      NUXT_PUBLIC_OPERATOR_NAME: 'Approved Operator',
      NUXT_PUBLIC_PRIVACY_CONTACT_URL: 'https://example.test/privacy',
      NODE_ENV: 'production',
    })).toContain(expectedError)
  })

  test('does not impose production values on local and test runtimes', () => {
    expect(productionConfigurationErrors({})).toEqual([])
  })

  test('accepts the cost-optimized combined showcase service without a private backend host', () => {
    expect(productionConfigurationErrors({
      JOIN_SPLIT_VALIDATE_PRODUCTION: 'true',
      JOIN_SPLIT_COMBINED_SERVICE: 'true',
      JOIN_SPLIT_CANONICAL_ORIGIN: 'https://joinsplit.tiny-bits.org',
      NUXT_PUBLIC_API_BASE: 'https://joinsplit.tiny-bits.org',
      NUXT_PUBLIC_OPERATOR_NAME: 'Approved Operator',
      NUXT_PUBLIC_PRIVACY_CONTACT_URL: 'mailto:privacy@example.test',
      NODE_ENV: 'production',
    })).toEqual([])
  })

  test.each([
    [{ NUXT_PUBLIC_OPERATOR_NAME: '', NUXT_PUBLIC_PRIVACY_CONTACT_URL: 'https://example.test/privacy' }, 'NUXT_PUBLIC_OPERATOR_NAME'],
    [{ NUXT_PUBLIC_OPERATOR_NAME: 'CHANGE_ME_OPERATOR', NUXT_PUBLIC_PRIVACY_CONTACT_URL: 'https://example.test/privacy' }, 'NUXT_PUBLIC_OPERATOR_NAME'],
    [{ NUXT_PUBLIC_OPERATOR_NAME: '  CHANGE_ME_OPERATOR', NUXT_PUBLIC_PRIVACY_CONTACT_URL: 'https://example.test/privacy' }, 'NUXT_PUBLIC_OPERATOR_NAME'],
    [{ NUXT_PUBLIC_OPERATOR_NAME: 'Approved Operator', NUXT_PUBLIC_PRIVACY_CONTACT_URL: 'CHANGE_ME_CONTACT' }, 'NUXT_PUBLIC_PRIVACY_CONTACT_URL'],
    [{ NUXT_PUBLIC_OPERATOR_NAME: 'Approved Operator', NUXT_PUBLIC_PRIVACY_CONTACT_URL: 'http://example.test/privacy' }, 'NUXT_PUBLIC_PRIVACY_CONTACT_URL'],
    [{ NUXT_PUBLIC_OPERATOR_NAME: 'Approved Operator', NUXT_PUBLIC_PRIVACY_CONTACT_URL: 'mailto:' }, 'NUXT_PUBLIC_PRIVACY_CONTACT_URL'],
  ])('requires approved public operator and privacy contact values', (overrides, expectedError) => {
    expect(productionConfigurationErrors({
      JOIN_SPLIT_VALIDATE_PRODUCTION: 'true',
      JOIN_SPLIT_CANONICAL_ORIGIN: 'https://joinsplit.tiny-bits.org',
      NUXT_PUBLIC_API_BASE: 'https://joinsplit.tiny-bits.org',
      JOIN_SPLIT_BACKEND_HOSTPORT: 'joinsplit-backend:10000',
      NODE_ENV: 'production',
      ...overrides,
    })).toContain(expectedError)
  })

  test('requires a private backend host and port in production', () => {
    expect(productionConfigurationErrors({
      JOIN_SPLIT_VALIDATE_PRODUCTION: 'true',
      JOIN_SPLIT_CANONICAL_ORIGIN: 'https://joinsplit.tiny-bits.org',
      NUXT_PUBLIC_API_BASE: 'https://joinsplit.tiny-bits.org',
      JOIN_SPLIT_BACKEND_HOSTPORT: 'https://public.example.test/api',
      NUXT_PUBLIC_OPERATOR_NAME: 'Approved Operator',
      NUXT_PUBLIC_PRIVACY_CONTACT_URL: 'mailto:privacy@example.test',
      NODE_ENV: 'production',
    })).toContain('JOIN_SPLIT_BACKEND_HOSTPORT')
  })

  test('builds backend proxy targets without accepting scheme-relative paths', () => {
    const environment = { JOIN_SPLIT_BACKEND_HOSTPORT: 'joinsplit-backend:10000' }
    expect(backendProxyTarget(environment, '/api/groups?pending=1'))
      .toBe('http://joinsplit-backend:10000/api/groups?pending=1')
    expect(() => backendProxyTarget(environment, '//attacker.example/path')).toThrow()
  })
})
