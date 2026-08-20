import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import generouted from '@generouted/react-router/plugin'
import { cloudflare } from '@cloudflare/vite-plugin'
import checker from 'vite-plugin-checker'
import { deepspaceBuild } from 'deepspace/build'

export default defineConfig({
  plugins: [
    react(),
    generouted(),
    cloudflare(),
    // Runs the Rules of Hooks lint (see eslint.config.js) automatically, so
    // there's no separate step to remember: a violation surfaces as an overlay
    // during `deepspace dev` and fails the build during `deepspace deploy`.
    // That stops the cryptic "Minified React error #310 / #300" crash before
    // it can ship.
    checker({
      eslint: {
        lintCommand: 'eslint .',
        useFlatConfig: true,
      },
    }),
    // Owns the build-time wiring the SDK is entitled to change under us: it
    // deletes the preview `.dev.vars` the Cloudflare plugin drops beside the
    // built worker (a second plaintext copy of every secret, left in dist/ by a
    // bare `vite build`), supplies the client `dedupe` list that used to be
    // hand-maintained here, and stamps the app id from wrangler.toml. Adopting
    // it is the fix `deepspace app update` asks for; see
    // docs/migrations/build-preview-secrets.md.
    deepspaceBuild({ appDir: fileURLToPath(new URL('.', import.meta.url)) }),
  ],
  optimizeDeps: {
    // generouted loads routes via `import.meta.glob`, which Vite's esbuild dep-scanner
    // does not evaluate — so every dep reachable only through the page tree (UI libs,
    // and deepspace via _app.tsx) is invisible to the cold scan, discovered late, and
    // triggers a re-optimize + full reload on first `dev` boot. That reload is where a
    // transient "Cannot read properties of null (reading 'useState')" can surface before
    // the error boundary recovers. Point the scanner at the route files (plus the html
    // entry) so the first optimize pass is complete and no late re-optimize fires.
    // Scoped to src/pages (NOT all of src) so worker-only modules — actions, cron, jobs,
    // ai, which import deepspace/worker — are not dragged into the client optimizer.
    // Dev-only; `vite build` ignores optimizeDeps.
    entries: ['./index.html', './src/pages/**/*.tsx'],
  },
})
