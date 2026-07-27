import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `sync/**` e `tools/**` estavam nesta lista. Era o código que autentica no Jira,
  // classifica os status e PUBLICA o dataset recebendo MENOS controle estático que a UI que
  // só desenha o resultado. Removidos em 2026-07-27, junto com a entrada de `sync/`,
  // `scripts/` e `tools/` no typecheck (ver tsconfig.tools.json).
  globalIgnores([
    'dist',
    'scripts/debug-helpers/**',
    'playwright-report/**',
    'test-results/**',
    'node_modules/**',
    'scratch/**',
  ]),
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
  },
  // Código Node (roda por tsx, não no browser): process, Buffer, console de servidor.
  // As regras de React não se aplicam — e sem este bloco `process` viraria no-undef.
  {
    files: ['sync/**/*.ts', 'scripts/**/*.ts', 'tools/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
])
