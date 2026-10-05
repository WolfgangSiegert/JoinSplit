import { applicationFetch } from './http-transport'

export interface ShowcaseTrafficNavigator {
  readonly globalPrivacyControl?: boolean
  readonly webdriver?: boolean
}

export interface ShowcaseTrafficContext extends ShowcaseTrafficNavigator {
  readonly appOrigin: string
  readonly endpoint: string
  readonly nativeApp: boolean
  readonly prerendering: boolean
}

export const SHOWCASE_TRAFFIC_ENDPOINT = 'https://atm.tiny-bits.org/api/showcase-traffic'
export const SHOWCASE_APP_ORIGIN = 'https://joinsplit.tiny-bits.org'

export type ShowcaseTrafficPlan = 'record' | 'wait-for-activation' | 'skip'

export type ShowcaseTrafficResult = 'recorded' | 'already-recorded' | 'skipped' | 'failed'

export function planShowcaseTraffic(context: ShowcaseTrafficContext): ShowcaseTrafficPlan {
  if (
    context.endpoint.trim() !== SHOWCASE_TRAFFIC_ENDPOINT
    || context.appOrigin !== SHOWCASE_APP_ORIGIN
    || context.nativeApp
    || context.globalPrivacyControl === true
    || context.webdriver === true
  ) return 'skip'

  return context.prerendering ? 'wait-for-activation' : 'record'
}

export function createShowcaseTrafficRecorder(fetcher: typeof fetch = applicationFetch) {
  let attempted = false
  let recording: Promise<ShowcaseTrafficResult> | null = null

  return function recordShowcaseTraffic(endpoint: string): Promise<ShowcaseTrafficResult> {
    const configuredEndpoint = endpoint.trim()
    if (configuredEndpoint !== SHOWCASE_TRAFFIC_ENDPOINT) return Promise.resolve('skipped')
    if (recording) return recording
    if (attempted) return Promise.resolve('already-recorded')
    attempted = true

    const body = new URLSearchParams({ version: '1', site: 'joinsplit', path: '/app' })
    recording = fetcher(configuredEndpoint, {
      method: 'POST',
      mode: 'no-cors',
      credentials: 'omit',
      cache: 'no-store',
      keepalive: true,
      referrerPolicy: 'no-referrer',
      body,
    })
      .then(() => 'recorded' as const)
      .catch(() => 'failed' as const)
      .finally(() => { recording = null })

    return recording
  }
}

export const recordShowcaseTraffic = createShowcaseTrafficRecorder()
