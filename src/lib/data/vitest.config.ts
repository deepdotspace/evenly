import { defineConfig } from 'vitest/config'

/**
 * Isolated Vitest config for the pure data-layer (balances + insights) and FX
 * selectors. The root `vite.config.ts` loads the Cloudflare Workers plugin + the
 * eslint checker, whose dep-optimizer errors out under a bare `vitest run` (Vite 8
 * / rolldown -- see docs/founder/sdk-issues.md). These modules have no runtime SDK
 * dependency (only type-only `import type` from `deepspace`), so we point Vitest at
 * just these unit tests with no plugins.
 *
 * Run: `npx vitest run --config src/lib/data/vitest.config.ts`
 */
export default defineConfig({
  test: {
    include: ['src/lib/data/**/*.test.ts', 'src/lib/fx/**/*.test.ts'],
    environment: 'node',
  },
})
