import { defineConfig } from 'vitest/config'

/**
 * Root Vitest config for plain `npx vitest run` / `npm run test:unit`.
 *
 * The app's `vite.config.ts` loads `@cloudflare/vite-plugin` + `vite-plugin-checker`,
 * whose dep-optimizer (Vite 8 / rolldown) errors with "Missing field 'tsconfigPaths'
 * on BindingViteResolvePluginConfig" when Vitest tries to start a node environment.
 *
 * This dedicated config loads NO plugins and targets only the pure unit suites.
 * The build path is unaffected: `vite build` always uses `vite.config.ts` directly
 * (Vite ignores vitest.config.ts), so the Cloudflare plugin remains intact there.
 *
 * The per-package isolated configs (`src/lib/split/vitest.config.ts`,
 * `src/lib/data/vitest.config.ts`) continue to work with explicit `--config` flags
 * for focused runs; this root config is the single-command entry point.
 */
export default defineConfig({
  test: {
    // Pure-logic unit suites (no DOM): the split/balance/fx engines and a few
    // pure helpers co-located under src/components (e.g. activity day-grouping).
    include: ['src/lib/**/*.test.ts', 'src/components/**/*.test.ts'],
    environment: 'node',
  },
})
