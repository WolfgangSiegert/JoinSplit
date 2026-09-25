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
  if (environment.JOIN_SPLIT_COMBINED_SERVICE !== 'true'
    && !internalHostPort(environment.JOIN_SPLIT_BACKEND_HOSTPORT)) errors.push('JOIN_SPLIT_BACKEND_HOSTPORT')
  if (environment.NODE_ENV !== 'production') errors.push('NODE_ENV')
  if (!configuredText(environment.NUXT_PUBLIC_OPERATOR_NAME)) errors.push('NUXT_PUBLIC_OPERATOR_NAME')
  if (!contactUrl(environment.NUXT_PUBLIC_PRIVACY_CONTACT_URL)) errors.push('NUXT_PUBLIC_PRIVACY_CONTACT_URL')

  return errors
}

export function backendProxyTarget(
  environment: Record<string, string | undefined>,
  pathAndQuery: string,
): string {
  const hostPort = environment.JOIN_SPLIT_BACKEND_HOSTPORT
  if (!internalHostPort(hostPort) || !pathAndQuery.startsWith('/') || pathAndQuery.startsWith('//')) {
    throw new Error('Invalid backend proxy target')
  }

  return `http://${hostPort}${pathAndQuery}`
}

function internalHostPort(value: string | undefined): boolean {
  return Boolean(value && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?:[1-9][0-9]{1,4}$/i.test(value))
}

function configuredText(value: string | undefined): boolean {
  const configured = value?.trim()
  return Boolean(configured && !configured.startsWith('CHANGE_ME'))
}

function contactUrl(value: string | undefined): boolean {
  if (!configuredText(value)) return false
  try {
    const url = new URL(value!.trim())
    const supportedDestination = url.protocol === 'https:'
      ? url.hostname !== ''
      : url.protocol === 'mailto:' && url.pathname !== ''
    return supportedDestination && !url.username && !url.password
  }
  catch {
    return false
  }
}
