import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import regexp from 'eslint-plugin-regexp';
import promise from 'eslint-plugin-promise';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';

// no-restricted-imports skips dynamic import(), so no-restricted-syntax covers that form.
const SURFACES = ['content', 'popup', 'sidepanel', 'options', 'background'];

// A content script's navigator.locks belongs to the page origin, so it cannot join the settings lock the other realms share.
const STORAGE_MUTATORS = [
  'updateSettings',
  'replaceRules',
  'replaceSitePrefs',
  'replaceVarietyOverrides',
  'replaceTaskBackends',
  'replaceTaskTemperatures',
  'replaceTaskMaxTokens',
  'replaceTaskReasoningEfforts',
  'replaceSnippets',
  'replaceTaskTones',
  'replaceTaskTemplates',
  'replaceUserRecipes',
  'replacePerPresetTemplates',
  'replaceSettings',
  'upsertCustomLanguage',
  'deleteCustomLanguage',
  'importBundle',
];
const NO_DIRECT_SETTINGS_WRITE = ['content', 'popup', 'sidepanel'];
const AREAS = ['shared', ...SURFACES].join('|');
// The bans above match the `@/` spelling only, so a relative path into another area would slip past them.
const RELATIVE_AREA_MESSAGE =
  'Import another src/ area through @/, so the surface and settings-writer bans see it.';

const crossSurfaceBans = ['shared', ...SURFACES].map((layer) => {
  const banned = SURFACES.filter((s) => s !== layer);
  const message = `src/${layer}/ must not import other surfaces. Move shared logic into src/shared/.`;
  const paths = [];
  if (NO_DIRECT_SETTINGS_WRITE.includes(layer)) {
    paths.push({
      name: '@/shared/storage',
      importNames: STORAGE_MUTATORS,
      message: `src/${layer}/ must write settings through patchSettings() in @/shared/settings-bus, so the service worker owns the read-modify-write.`,
    });
  }
  if (layer !== 'background' && layer !== 'shared') {
    paths.push({
      name: '@/shared/audit-log',
      importNames: ['pushAuditEntry', 'clearAuditLog'],
      message: `src/${layer}/ must go through the SW for audit-log writes (requestAuditEntry(), or an audit:clear message) — the service worker owns the read-modify-write.`,
    });
  }
  return {
    files: [`src/${layer}/**/*.ts`, `src/${layer}/**/*.svelte`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths,
          patterns: [
            { group: banned.flatMap((s) => [`@/${s}/*`, `@/${s}/*/**`]), message },
            { regex: `^(?:\\.\\./)+(?:${AREAS})/`, message: RELATIVE_AREA_MESSAGE },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: `ImportExpression > Literal[value=/^@\\u002f(?:${banned.join('|')})\\u002f/]`,
          message,
        },
        {
          selector: `ImportExpression > Literal[value=/^(?:\\.\\.\\u002f)+(?:${AREAS})\\u002f/]`,
          message: RELATIVE_AREA_MESSAGE,
        },
      ],
    },
  };
});

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  regexp.configs['flat/recommended'],
  {
    plugins: { unicorn },
    rules: {
      // A unicorn subset; the style-only rules (no-array-for-each, prefer-export-from, filename-case) stay off because they catch no bugs.
      'unicorn/prefer-node-protocol': 'error', // import 'node:fs' not 'fs'
      // 'unicorn/better-regex' disabled — fights with eslint-plugin-regexp's
      // `match-any` + `strict` rules (swaps `[\s\S]` → `[\S\s]`, which
      // regexp/match-any then flags).
      'unicorn/better-regex': 'off',
      'unicorn/no-empty-file': 'error',
      'unicorn/no-useless-undefined': 'off', // conflicts with exactOptionalPropertyTypes
      'unicorn/no-useless-fallback-in-spread': 'error',
      'unicorn/no-useless-length-check': 'error',
      'unicorn/no-useless-switch-case': 'error',
      'unicorn/no-zero-fractions': 'error',
      'unicorn/prefer-array-flat': 'error',
      'unicorn/prefer-array-flat-map': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-includes': 'error',
      'unicorn/prefer-number-properties': 'error', // Number.parseInt not parseInt
      'unicorn/prefer-optional-catch-binding': 'error',
      'unicorn/prefer-string-slice': 'error',
      'unicorn/prefer-string-starts-ends-with': 'error',
      'unicorn/prefer-type-error': 'error',
      'unicorn/throw-new-error': 'error',
      'unicorn/no-typeof-undefined': 'error',
      'unicorn/prefer-ternary': 'off', // often less readable for side-effect branches
    },
  },
  {
    plugins: { promise },
    rules: {
      // Skips prefer-await-to-*: a plain .then() chain is clearer in streaming and settle-either code.
      'promise/always-return': ['error', { ignoreLastCallback: true }],
      'promise/no-return-wrap': 'error',
      // param-names is style, not safety. Tests use `r` / `res` heavily;
      // the catch-or-return + always-return rules do the real bug work.
      'promise/param-names': 'off',
      'promise/catch-or-return': 'error',
      'promise/no-nesting': 'warn',
      'promise/no-promise-in-callback': 'warn',
      'promise/no-return-in-finally': 'warn',
      'promise/valid-params': 'error',
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.webextensions,
        chrome: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      // Use ?? fallbacks, narrowing or an invariant throw (src/shared/invariants.ts) instead of `!`.
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-expect-error': 'allow-with-description',
        },
      ],
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  ...crossSurfaceBans,
  {
    // Type-aware lint scoped to src + tests TS. Pulls in the TS program so
    // switch-exhaustiveness-check can see discriminated-union variants.
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: ts.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        {
          allowDefaultCaseForExhaustiveSwitch: true,
          requireDefaultForNonUnion: false,
        },
      ],
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true, ignoreIIFE: true }],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignoreConditionalTests: true }],
      '@typescript-eslint/prefer-optional-chain': 'error',
    },
  },
  {
    // src/ only: test mocks pass `async () => value` to satisfy an async contract.
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: ts.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/require-await': 'error',
    },
  },
  {
    // eslint-plugin-svelte 3 parses *.svelte.ts without the TS subparser, which fails on `import type`.
    files: ['**/*.svelte', '*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      'store/',
      '**/*.d.ts',
      'playwright-report/',
      'test-results/',
      '.stryker-tmp/',
      'reports/',
      '.worktrees/',
      'tests/explore/sessions/',
    ],
  },
];
