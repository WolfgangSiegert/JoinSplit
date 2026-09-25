function configuredOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null

  try {
    return new URL(value).origin
  }
  catch {
    return null
  }
}

export default defineEventHandler((event) => {
  const apiOrigin = configuredOrigin(useRuntimeConfig(event).public.apiBase)
  const connectSources = ["'self'", apiOrigin].filter((source): source is string => source !== null)

  setResponseHeaders(event, {
    'Content-Security-Policy': `default-src 'self'; base-uri 'self'; connect-src ${connectSources.join(' ')}; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`,
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  })

  if (process.env.NODE_ENV === 'production') {
    setResponseHeader(event, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
})
