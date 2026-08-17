import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    // AntD-heavy tests (Select/DatePicker/Modal/Upload interactions) can
    // exceed the 5s default under parallel load in CI/containers even
    // though they're fast in isolation — give them headroom rather than
    // flaking. Bumped again as more DatePicker-heavy suites were added.
    testTimeout: 30000,
  },
})
