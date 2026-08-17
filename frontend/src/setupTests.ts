import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Vitest globals are off (tests import explicitly), so RTL's own
// auto-cleanup detection doesn't kick in on its own — register it here
// once for every test file instead of repeating it everywhere.
afterEach(() => {
  cleanup()
})

// jsdom doesn't implement matchMedia; AntD's Layout/Grid components use it
// for responsive breakpoints even in non-responsive usages like ours.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// jsdom doesn't implement ResizeObserver either; AntD's Table/Select/Menu
// use it to measure and position themselves.
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
