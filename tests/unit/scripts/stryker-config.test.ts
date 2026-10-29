// @vitest-environment node
// A stale path in `mutate` is silent: Stryker skips it and the score still reads green.
import { describe, it, expect, vi } from 'vitest';
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

describe('stryker.conf.mjs shards', () => {
  const loadConfig = async (env: Record<string, string>) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.resetModules();
    try {
      return (await import('../../../stryker.conf.mjs')).default;
    } finally {
      vi.unstubAllEnvs();
    }
  };

  it('the mutation.yml matrix runs every shard, and the shards list every file once', async () => {
    const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/mutation.yml'), 'utf8');
    const matrix = /^\s*shard: \[([\d, ]+)\]$/m.exec(workflow)?.[1]?.split(',').map((s) => s.trim());
    expect(matrix).toBeDefined();
    const parts: string[] = [];
    for (const shard of matrix ?? []) {
      const { mutate: files } = await loadConfig({
        STRYKER_SHARD: shard,
        STRYKER_SHARD_TOTAL: String(matrix?.length),
      });
      expect(files.length).toBeGreaterThan(0);
      parts.push(...files);
    }
    expect(parts).toEqual(config.mutate);
  });

  it('refuses a shard number that does not exist', async () => {
    await expect(loadConfig({ STRYKER_SHARD: '0' })).rejects.toThrow(/STRYKER_SHARD=0/);
  });
});

describe('stryker.conf.mjs concurrency', () => {
  it('pins the worker count the CI budget and break score were measured at', () => {
    expect(config.concurrency).toBe(2);
  });
});
