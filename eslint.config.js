import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.stryker-tmp', 'out']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // api/ cron handlers and server-side lib modules that run in Node.js context.
  // These files use process.env and other Node globals unavailable in the browser.
  // Test files are also included — they run in Node.js via Vitest and may need
  // Node globals (e.g. process.env) when testing server-side modules.
  {
    files: ['api/**/*.js', 'src/lib/scraper/**/*.js', 'src/lib/notifyWhatsApp.js', 'src/lib/alertKate.js', 'src/lib/pictureOfDay.js', 'src/__tests__/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  // react-hooks 7.1 added set-state-in-effect. These files predate it and load data in an effect,
  // which the rule flags. They're a warning here until rewritten (#239 backfill); new code gets the error.
  {
    files: [
      'src/hooks/useBoardings.js',
      'src/hooks/useDogs.js',
      'src/hooks/useEmployees.js',
      'src/hooks/useMessageLog.js',
      'src/hooks/useNightAssignments.js',
      'src/hooks/usePayments.js',
      'src/hooks/useSettings.js',
      'src/hooks/useSyncHistory.js',
      'src/hooks/useSyncSettings.js',
      'src/pages/SettingsPage.jsx',
    ],
    rules: { 'react-hooks/set-state-in-effect': 'warn' },
  },
])
