// A settings writer missing from the ban list is silent: content/popup/sidepanel can import it and lint stays green.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import * as storage from '@/shared/storage';

const root = path.resolve(__dirname, '../../..');
const config = fs.readFileSync(path.join(root, 'eslint.config.js'), 'utf8');
const listed = /const STORAGE_MUTATORS = \[([^\]]*)\]/.exec(config)?.[1] ?? '';

describe('eslint.config.js STORAGE_MUTATORS', () => {
  it('lists every settings writer @/shared/storage exports', () => {
    const writers = Object.keys(storage).filter((k) =>
      /^(?:update|replace|upsert|delete|import|write|with)/.test(k),
    );
    expect(writers.length).toBeGreaterThan(0);
    expect(writers.filter((w) => !listed.includes(`'${w}'`))).toEqual([]);
  });

  it('names nothing the module stopped exporting', () => {
    const names = [...listed.matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
    expect(names.filter((n) => !(n in storage))).toEqual([]);
  });
});

describe('eslint.config.js backup module', () => {
  it('bans the backup module in the popup, static or dynamic', async () => {
    const source = [
      '<script lang="ts">',
      "  import { exportAll } from '@/shared/storage/backup';",
      "  void import('@/shared/storage/backup');",
      '  void exportAll;',
      '</script>',
      '',
    ].join('\n');
    const [result] = await new ESLint({ cwd: root }).lintText(source, {
      filePath: 'src/popup/Zz.svelte',
    });
    expect(result?.messages.map((m) => [m.line, m.ruleId])).toEqual([
      [2, 'no-restricted-imports'],
      [3, 'no-restricted-syntax'],
    ]);
  }, 60_000);
});

describe('eslint.config.js relative imports', () => {
  it('bans a settings writer and another surface reached by a relative path', async () => {
    const source = [
      '<script lang="ts">',
      "  import { updateSettings } from '../shared/storage';",
      "  void import('../options/deep-link');",
      '  void updateSettings;',
      '</script>',
      '',
    ].join('\n');
    const [result] = await new ESLint({ cwd: root }).lintText(source, {
      filePath: 'src/content/Zz.svelte',
    });
    expect(result?.messages.map((m) => [m.line, m.ruleId])).toEqual([
      [2, 'no-restricted-imports'],
      [3, 'no-restricted-syntax'],
    ]);
  }, 60_000);

  it('bans test code from src', async () => {
    const source = [
      '<script lang="ts">',
      "  import { a } from '@tests/_helpers/page-translate';",
      "  import { b } from './perf-timings.test-utils';",
      "  import { c } from '../../tests/mocks/chrome';",
      "  void import('@tests/_helpers/page-translate');",
      "  void import('./perf-timings.test-utils');",
      "  void import('../../tests/mocks/chrome');",
      '  void a;',
      '  void b;',
      '  void c;',
      '</script>',
      '',
    ].join('\n');
    const [result] = await new ESLint({ cwd: root }).lintText(source, {
      filePath: 'src/shared/Zz.svelte',
    });
    expect(result?.messages.map((m) => [m.line, m.message])).toEqual([
      [2, expect.stringContaining('must not import test code')],
      [3, expect.stringContaining('must not import test code')],
      [4, expect.stringContaining('must not import test code')],
      [5, expect.stringContaining('must not import test code')],
      [6, expect.stringContaining('must not import test code')],
      [7, expect.stringContaining('must not import test code')],
    ]);
  }, 60_000);
});
