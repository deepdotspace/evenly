import { defineConfig } from 'vitest/config'

/**
 * Isolated Vitest config for the pure export modules (statement + CSV).
 *
 * Mirrors `src/lib/data/vitest.config.ts`: the root `vite.config.ts` loads the
 * Cloudflare + checker plugins, whose dep-optimizer errors out under a bare
 * `vitest run` (Vite 8 / rolldown). The statement/CSV builders have no runtime
 * SDK or DOM dependency (only type-only `import type` from `deepspace`), so we
 * point Vitest at just these tests with no plugins.
 *
 * Run: `npx vitest run --config src/components/export/vitest.config.ts`
 */
export default defineConfig({
  test: {
    include: ['src/components/export/**/*.test.ts'],
    environment: 'node',
  },
})
