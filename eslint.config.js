import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
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
  {
    files: ['api/**/*.js', 'src/lib/scraper/**/*.js', 'src/lib/notifyWhatsApp.js', 'src/lib/pictureOfDay.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
])
