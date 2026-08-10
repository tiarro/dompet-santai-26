import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node'
  }
})
