export default defineNuxtConfig({
  compatibilityDate: '2026-09-09',
  devtools: { enabled: false },
  telemetry: false,
  modules: ['@pinia/nuxt', '@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      apiBase: 'http://127.0.0.1:8000',
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
  app: {
    head: {
      title: 'JoinSplit',
      htmlAttrs: { lang: 'de' },
      meta: [{ name: 'description', content: 'Gemeinsame Ausgaben mit JoinSplit.' }],
    },
  },
})
