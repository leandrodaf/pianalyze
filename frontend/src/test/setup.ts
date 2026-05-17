import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Svelte 5 resolves to index-server.js by default in Node.js/vitest.
// Use a relative filesystem path to bypass the package.json exports conditions
// and load the browser bundle directly.
vi.mock('svelte', async () => {
  return await import('../../node_modules/svelte/src/index-client.js')
})

// Svelte 5 transitions use the Web Animations API which jsdom doesn't implement.
Object.defineProperty(Element.prototype, 'animate', {
  writable: true,
  value: () => ({
    finished: Promise.resolve(),
    cancel: () => {},
    play: () => {},
    pause: () => {},
    currentTime: 0,
    playbackRate: 1,
    onfinish: null,
    oncancel: null,
  }),
})

Object.defineProperty(Element.prototype, 'getAnimations', {
  writable: true,
  value: () => [],
})
