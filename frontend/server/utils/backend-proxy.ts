import { getRequestURL, proxyRequest, type H3Event } from 'h3'
import { backendProxyTarget } from './production-config'

export function proxyBackendRequest(event: H3Event): Promise<unknown> {
  const requestUrl = getRequestURL(event)
  const target = backendProxyTarget(process.env, requestUrl.pathname + requestUrl.search)

  return proxyRequest(event, target)
}
