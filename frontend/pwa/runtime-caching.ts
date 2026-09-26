interface WorkboxRouteContext {
  request: Pick<Request, 'destination' | 'method' | 'mode'>
  url: URL
}

// Workbox serializes these callbacks into the generated Service Worker. Keep
// every callback self-contained rather than referencing module-level helpers.
export function isNetworkOnlyRequest({ url }: WorkboxRouteContext): boolean {
  const path = url.pathname.replace(/\/+$/, '') || '/'

  return url.origin === globalThis.location.origin
    && (path === '/api'
      || path.startsWith('/api/')
      || path === '/ready'
      || path === '/health'
      || path === '/up')
}

export function isCacheableAppNavigation({ request, url }: WorkboxRouteContext): boolean {
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const isExcludedPath = path === '/api'
    || path.startsWith('/api/')
    || path === '/ready'
    || path === '/health'
    || path === '/up'

  return request.method === 'GET'
    && request.mode === 'navigate'
    && url.origin === globalThis.location.origin
    && !isExcludedPath
}

export function isCacheablePublicAsset({ request, url }: WorkboxRouteContext): boolean {
  return request.method === 'GET'
    && url.origin === globalThis.location.origin
    && ['font', 'image', 'manifest', 'script', 'style'].includes(request.destination)
}
