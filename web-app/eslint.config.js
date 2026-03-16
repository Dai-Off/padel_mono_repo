import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Build the extends array safely — react-hooks may or may not support flat config
const reactHooksConfig = reactHooks.configs?.flat?.recommended
  ?? { plugins: { 'react-hooks': reactHooks }, rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' } }

const reactRefreshConfig = reactRefresh.configs?.vite ?? { plugins: { 'react-refresh': reactRefresh }, rules: { 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }] } }

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooksConfig,
      reactRefreshConfig,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
