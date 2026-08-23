import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `dev-dist` is the dev-mode service worker emitted by `npm run dev:pwa`;
  // `test-results` is Playwright's output. Both are generated, neither is ours.
  globalIgnores(['dist', 'dist-e2e', 'dev-dist', 'test-results', 'playwright-report']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // TiptapEditor n'est chargé qu'en lazy par RichText : un import statique
      // ailleurs remettrait le chunk tiptap (~130 KiB gzip) dans le chemin
      // critique des routes sans que rien ne le signale.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/components/character/TiptapEditor',
              message:
                'Import RichText (@/components/shared/RichText) instead — TiptapEditor is lazy-loaded there to keep tiptap out of route chunks.',
            },
          ],
        },
      ],
    },
  },
  {
    // Seul point d'entrée légitime (import() dynamique uniquement, mais la
    // règle couvre aussi l'import de type éventuel).
    files: ['src/components/shared/RichText.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
])
