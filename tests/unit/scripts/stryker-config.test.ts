// @vitest-environment node
// A stale path in `mutate` is silent: Stryker skips it and the score still reads green.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import config from '../../../stryker.conf.mjs';

const repoRoot = path.resolve(__dirname, '../../..');

describe('stryker.conf.mjs mutate list', () => {
  const mutate = config.mutate;

  it('lists only paths that exist', () => {
    const missing = mutate.filter((p) => !fs.existsSync(path.join(repoRoot, p)));
    expect(missing).toEqual([]);
  });

  it('has no duplicates', () => {
    expect(mutate).toHaveLength(new Set(mutate).size);
  });

  it('covers every correctness core the audit named', () => {
    for (const core of [
      'src/background/router.ts',
      'src/background/cache.ts',
      'src/shared/storage/sanitise.ts',
      'src/sidepanel/state/conversation-store.ts',
      'src/shared/backends/sseParser.ts',
      'src/content/page-translate-v2/index.ts',
    ]) {
      expect(mutate).toContain(core);
    }
  });
});

describe('stryker.conf.mjs concurrency', () => {
  it('pins the worker count the CI budget and break score were measured at', () => {
    expect(config.concurrency).toBe(2);
  });
});
