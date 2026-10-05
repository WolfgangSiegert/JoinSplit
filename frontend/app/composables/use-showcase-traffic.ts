import {
  planShowcaseTraffic,
  recordShowcaseTraffic,
  type ShowcaseTrafficNavigator,
} from '../services/showcase-traffic'

export function useShowcaseTraffic() {
  const config = useRuntimeConfig()

  async function recordVisit(): Promise<void> {
    if (!import.meta.client) return

    const navigatorState = navigator as ShowcaseTrafficNavigator
    const prerenderingDocument = document as Document & { readonly prerendering?: boolean }
    const plan = planShowcaseTraffic({
      endpoint: config.public.showcaseTrafficUrl,
      appOrigin: window.location.origin,
      nativeApp: config.public.nativeApp,
      prerendering: prerenderingDocument.prerendering === true,
      globalPrivacyControl: navigatorState.globalPrivacyControl,
      webdriver: navigatorState.webdriver,
    })

    if (plan === 'skip') return
    if (plan === 'wait-for-activation') {
      prerenderingDocument.addEventListener('prerenderingchange', () => {
        void recordShowcaseTraffic(config.public.showcaseTrafficUrl)
      }, { once: true })
      return
    }

    await recordShowcaseTraffic(config.public.showcaseTrafficUrl)
  }

  return { recordVisit }
}
