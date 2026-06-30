import { defineConfig } from 'vitest/config'

/**
 * Isolated Vitest config for the pure split-math engine. The root `vite.config.ts`
 * pulls in the Cloudflare Workers plugin + the eslint checker, whose dep-optimizer
 * (Vite 8 / rolldown) errors out under a bare `vitest run`. The engine has zero
 * runtime deps, so we point Vitest at just these unit tests with no plugins.
 *
 * Run: `npx vitest run --config src/lib/split/vitest.config.ts`
 */
export default defineConfig({
  test: {
    include: ['src/lib/**/*.test.ts'],
    environment: 'node',
  },
})
