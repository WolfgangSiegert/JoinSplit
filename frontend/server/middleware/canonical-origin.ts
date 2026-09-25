import { getRequestHost, sendRedirect } from 'h3'

export default defineEventHandler((event) => {
  if (process.env.JOIN_SPLIT_VALIDATE_PRODUCTION !== 'true' || event.path === '/health') return

  const canonicalOrigin = process.env.JOIN_SPLIT_CANONICAL_ORIGIN
  if (!canonicalOrigin) return

  const canonicalUrl = new URL(canonicalOrigin)
  if (getRequestHost(event, { xForwardedHost: true }).toLowerCase() === canonicalUrl.host.toLowerCase()) return

  return sendRedirect(event, new URL(event.path, canonicalUrl).toString(), 308)
})
