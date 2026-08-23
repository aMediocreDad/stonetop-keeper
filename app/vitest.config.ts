import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    // `e2e/` is Playwright's (see playwright.config.ts). Vitest collecting
    // those files fails at import: @playwright/test refuses to run outside its
    // own runner.
    exclude: ['node_modules/**', 'dist/**', 'dev-dist/**', 'e2e/**'],
    // Unmounts anything a test rendered. See the file for why this is not
    // automatic here.
    setupFiles: ['./src/test/setup.ts'],
    // Vite loads `.env.local` in every mode, test included. With real
    // credentials present, `getSupabase()` returns a live client and the hook
    // tests — which seed `localDb` and assume the localStorage fallback —
    // fire real network calls that come back INVALID_TOKEN. Blanking the vars
    // here pins the suite to the fallback backend on every machine, whether or
    // not the developer has an `.env.local`.
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_NEXT_PUBLIC_SUPABASE_URL: '',
      VITE_NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      VITE_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
    },
  },
});
