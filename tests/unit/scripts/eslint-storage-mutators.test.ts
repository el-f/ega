// A settings writer missing from the ban list is silent: content/popup/sidepanel can import it and lint stays green.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as storage from '@/shared/storage';

const config = fs.readFileSync(path.resolve(__dirname, '../../..', 'eslint.config.js'), 'utf8');
const listed = /const STORAGE_MUTATORS = \[([^\]]*)\]/.exec(config)?.[1] ?? '';

describe('eslint.config.js STORAGE_MUTATORS', () => {
  it('lists every settings writer @/shared/storage exports', () => {
    const writers = Object.keys(storage).filter((k) =>
      /^(?:update|replace|upsert|delete|import)/.test(k),
    );
    expect(writers.length).toBeGreaterThan(0);
    expect(writers.filter((w) => !listed.includes(`'${w}'`))).toEqual([]);
  });

  it('names nothing the module stopped exporting', () => {
    const names = [...listed.matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
    expect(names.filter((n) => !(n in storage))).toEqual([]);
  });
});
