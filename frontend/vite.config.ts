import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'
  // SENTRY_AUTH_TOKEN is a CI-only secret read from process.env at build time.
  // It is NEVER baked into the JS bundle — only the Vite plugin uses it to
  // upload source maps to Sentry's API, then the maps are deleted from dist/.
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
      // Source map upload: active only in production builds that have a Sentry
      // auth token available (CI release builds only). Maps are deleted from
      // dist/ after upload so they are never embedded in the Wails binary.
      ...(isProduction && hasSentryToken
        ? [sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: { name: process.env.SENTRY_RELEASE },
            sourcemaps: {
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
      // Generate source maps for release builds. 'hidden' keeps the
      // sourceMappingURL comment out of JS files — end users never see them.
      sourcemap: isProduction ? 'hidden' : false,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  }
})
