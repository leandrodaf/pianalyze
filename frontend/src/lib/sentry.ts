import * as Sentry from '@sentry/svelte'

// VITE_SENTRY_DSN is injected at build time via Vite env vars (set only in CI
// release builds). When undefined, every call below becomes a no-op.
const dsn: string | undefined = import.meta.env.VITE_SENTRY_DSN
const release: string | undefined = import.meta.env.VITE_RELEASE

export function initSentry(): void {
  if (!dsn) return

  Sentry.init({
    dsn,
    release,
    environment: import.meta.env.MODE, // 'production' | 'development'
    // No performance tracing or session replay — errors only.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}
