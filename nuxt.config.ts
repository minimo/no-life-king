// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  future: {
    compatibilityVersion: 3,
  },
  devServer: {
    port: 3340
  },
  modules: ['@pinia/nuxt'],
})
