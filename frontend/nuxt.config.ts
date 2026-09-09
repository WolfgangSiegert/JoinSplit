export default defineNuxtConfig({
  compatibilityDate: '2026-09-09',
  devtools: { enabled: false },
  telemetry: false,
  modules: ['@pinia/nuxt', '@nuxt/ui'],
  css: ['~/assets/css/main.css'],
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
