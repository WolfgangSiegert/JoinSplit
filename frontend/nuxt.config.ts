import {
  isCacheableAppNavigation,
  isCacheablePublicAsset,
  isNetworkOnlyRequest,
} from './pwa/runtime-caching'

const nativeBuild = process.env.JOIN_SPLIT_NATIVE_BUILD === 'true'
const nativeApiOrigin = 'https://joinsplit.tiny-bits.org'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-09',
  devtools: { enabled: false },
  telemetry: false,
  ssr: !nativeBuild,
  modules: ['@pinia/nuxt', '@nuxt/ui', '@vite-pwa/nuxt'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      apiBase: 'http://127.0.0.1:8000',
      nativeApp: nativeBuild,
      operatorName: 'Wolfgang Siegert',
      privacyContactUrl: 'mailto:WoSiegert@hotmail.com',
    },
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
  ui: {
    fonts: false,
    colorMode: false,
  },
  pwa: {
    disable: nativeBuild,
    registerType: 'prompt',
    client: {
      installPrompt: true,
    },
    includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
    manifest: {
      id: '/',
      name: 'JoinSplit',
      short_name: 'JoinSplit',
      description: 'Gemeinsame Ausgaben erfassen, fair aufteilen und übersichtlich ausgleichen.',
      lang: 'de',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#fbf7f0',
      theme_color: '#c44332',
      categories: ['finance', 'utilities'],
      icons: [
        {
          src: '/pwa-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/pwa-maskable-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      cleanupOutdatedCaches: true,
      navigateFallback: undefined,
      runtimeCaching: [
        {
          urlPattern: isNetworkOnlyRequest,
          handler: 'NetworkOnly',
        },
        {
          urlPattern: isCacheableAppNavigation,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'joinsplit-app-documents-v1',
            networkTimeoutSeconds: 5,
            cacheableResponse: { statuses: [200] },
            expiration: {
              maxEntries: 12,
              maxAgeSeconds: 7 * 24 * 60 * 60,
              purgeOnQuotaError: true,
            },
          },
        },
        {
          urlPattern: isCacheablePublicAsset,
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'joinsplit-public-assets-v1',
            cacheableResponse: { statuses: [200] },
            expiration: {
              maxEntries: 80,
              maxAgeSeconds: 30 * 24 * 60 * 60,
              purgeOnQuotaError: true,
            },
          },
        },
      ],
    },
    devOptions: {
      enabled: false,
    },
  },
  app: {
    head: {
      title: 'JoinSplit',
      htmlAttrs: { lang: 'de' },
      meta: [
        { name: 'description', content: 'Gemeinsame Ausgaben mit JoinSplit.' },
        { name: 'theme-color', content: '#c44332' },
        ...(nativeBuild
          ? [{
              'http-equiv': 'Content-Security-Policy',
              content: `default-src 'self'; base-uri 'self'; connect-src 'self' ${nativeApiOrigin}; font-src 'self' data:; form-action 'self'; img-src 'self' data: blob:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`,
            }]
          : []),
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
    },
  },
})
