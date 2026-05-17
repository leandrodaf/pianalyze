import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'
  const hasSentryToken = !!process.env.SENTRY_AUTH_TOKEN

  return {
    plugins: [
      svelte({
        compilerOptions: {
          // Svelte 5 compatibility: keep component API compatible with Svelte 4
          // so @testing-library/svelte can mount components via new Component() in jsdom.
          // Remove once tests are migrated to Svelte 5 mount() API.
          compatibility: { componentApi: 4 }
        }
      }),
      svelteTesting(),
      // Upload source maps to Sentry only on production builds with auth token.
      // After upload the plugin deletes the map files so they never end up
      // embedded in the Wails binary.
      ...(isProduction && hasSentryToken
        ? [sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: { name: process.env.VITE_RELEASE },
            sourcemaps: {
              // Delete .map files after upload — they must not be shipped in the binary.
              filesToDeleteAfterUpload: ['./dist/**/*.map'],
            },
            telemetry: false,
          })]
        : []),
    ],
    resolve: {
      alias: {
        '/wailsjs': '/wailsjs'
      }
    },
    build: {
      // 'hidden' = source maps are generated but the sourceMappingURL comment is
      // NOT added to JS files, so end users see no reference to them. The Sentry
      // plugin uploads and then deletes them, keeping the dist folder clean.
      sourcemap: isProduction ? 'hidden' : false,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  }
})
