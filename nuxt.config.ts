// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  future: {
    compatibilityVersion: 3,
  },
  devServer: {
    port: 3340
  },
  modules: ['@pinia/nuxt'],
})
