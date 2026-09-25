const EXPECTED_ORIGIN = 'https://joinsplit.tiny-bits.org'

function origin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  }
  catch {
    return null
  }
}

export function productionConfigurationErrors(environment: Record<string, string | undefined>): string[] {
  if (environment.JOIN_SPLIT_VALIDATE_PRODUCTION !== 'true') return []

  const canonicalOrigin = origin(environment.JOIN_SPLIT_CANONICAL_ORIGIN)
  const apiOrigin = origin(environment.NUXT_PUBLIC_API_BASE)
  const errors: string[] = []
  if (canonicalOrigin !== EXPECTED_ORIGIN) errors.push('JOIN_SPLIT_CANONICAL_ORIGIN')
  if (apiOrigin !== canonicalOrigin) errors.push('NUXT_PUBLIC_API_BASE')
  if (environment.NODE_ENV !== 'production') errors.push('NODE_ENV')

  return errors
}
