import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaManifest } from './src/pwaManifest'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    inspectAttr(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The service worker is a PRODUCTION artefact: `npm run dev` has none,
      // so DevTools shows no worker and an offline reload just fails. That is
      // vite-plugin-pwa's default and it is the right one — a worker caching
      // assets during development fights HMR.
      //
      // `npm run dev:pwa` sets this flag to get a worker on the dev server
      // when the thing being worked on IS the offline behaviour. Verify
      // release behaviour with `npm run preview`, which serves the real build.
      devOptions: {
        enabled: process.env.VITE_PWA_DEV === '1',
        type: 'module',
        suppressWarnings: true,
      },
      // Static shell only. Supabase responses live in IndexedDB (see
      // src/lib/offline/), where they are structured, role-keyed and
      // purgeable on sign-out — none of which a URL cache can do.
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}', '**/*-latin.woff2'],
        // Assets the worker never serves: `og-image.png` is read by social
        // crawlers and `apple-touch-icon.png` by iOS at add-to-home-screen
        // time — both online by definition — and `logo.svg` is referenced
        // nowhere in the app. Together ~430 kB of precache for zero offline
        // value. `favicon.png` stays: it is the manifest icon.
        globIgnores: ['**/og-image.png', '**/apple-touch-icon.png', '**/logo.svg'],
        // latin-ext is ~600 kB that most sessions never touch: fetched and
        // kept on demand instead of precached.
        runtimeCaching: [
          {
            urlPattern: /\/fonts\/.*-latin-ext\.woff2$/,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts-latin-ext', expiration: { maxEntries: 16 } },
          },
        ],
        // CRITICAL. wrangler.jsonc routes /mcp and /mcp/* to the Worker via
        // `run_worker_first`; without this the SPA navigation fallback serves
        // index.html for them straight out of precache and the MCP endpoint
        // starts answering HTML. No test catches it — the suite calls
        // worker.fetch directly — so it would surface only in production.
        navigateFallbackDenylist: [/^\/mcp/],
      },
      manifest: pwaManifest,
    }),
  ],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'motion': ['framer-motion'],
          'tiptap': [
            '@tiptap/react',
            '@tiptap/starter-kit',
            '@tiptap/extension-placeholder',
            '@tiptap/extension-mention',
            '@tiptap/suggestion',
          ],
          'graph': [
            'graphology',
            'sigma',
            'd3-force',
          ],
        },
      },
    },
  },
});
