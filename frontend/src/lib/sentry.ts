import { ReportError } from '../../wailsjs/go/main/App'

// Sets up global handlers for uncaught errors and unhandled Promise rejections.
// All errors are forwarded to the Go backend, which sends them to Sentry.
// No Sentry SDK or credentials ever touch the frontend bundle.
export function initErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    const stack = event.error instanceof Error ? (event.error.stack ?? '') : ''
    ReportError(event.message, stack).catch(() => {})
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? (reason.stack ?? '') : ''
    ReportError(`Unhandled Promise rejection: ${message}`, stack).catch(() => {})
  })
}
