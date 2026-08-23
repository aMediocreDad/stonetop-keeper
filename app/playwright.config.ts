import { defineConfig } from '@playwright/test';

/**
 * End-to-end checks for the things Vitest structurally cannot see: service
 * worker registration, the precache, and whether the app actually survives a
 * reload with the network cut.
 *
 * Runs against `vite preview` — the real build — because the service worker is
 * a production artefact and does not exist on the dev server.
 *
 * `channel: 'chrome'` uses the locally installed Google Chrome instead of a
 * Playwright-managed download: it is the browser this app is actually used in,
 * and it avoids a ~150 MB fetch on every clean checkout.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
    trace: 'off',
  },
  webServer: {
    // Serves `dist-e2e`, built with dummy Supabase credentials so the suite
    // can intercept every backend call and never touches a real project.
    command: 'npm run build:e2e && node ./node_modules/vite/bin/vite.js preview --outDir dist-e2e --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
