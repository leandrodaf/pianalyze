import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'

export default defineConfig({
  plugins: [svelte({
    compilerOptions: {
      // Svelte 5 compatibility: keep component API compatible with Svelte 4
      // so @testing-library/svelte can mount components via new Component() in jsdom.
      // Remove once tests are migrated to Svelte 5 mount() API.
      compatibility: { componentApi: 4 }
    }
  }), svelteTesting()],
  resolve: {
    alias: {
      '/wailsjs': '/wailsjs'
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  }
})
