import { writable } from 'svelte/store'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: number
  message: string
  type: ToastType
  duration: number
}

let _id = 0

export const toasts = writable<Toast[]>([])

export function addToast(message: string, type: ToastType = 'info', duration = 4000) {
  const id = ++_id
  toasts.update(ts => [...ts, { id, message, type, duration }])
  setTimeout(() => removeToast(id), duration)
}

export function removeToast(id: number) {
  toasts.update(ts => ts.filter(t => t.id !== id))
}
