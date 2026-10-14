import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCodeSnippets } from '../../../scripts/visual-judge/audit/code';
import { FEATURES } from '../../../scripts/visual-judge/features';

describe('FEATURES code paths', () => {
  for (const f of FEATURES) {
    for (const p of f.codePaths) {
      it(`${f.id}: ${p} loads at least one file`, async () => {
        const snippets = await loadCodeSnippets(process.cwd(), [p], Number.POSITIVE_INFINITY);
        expect(snippets.length).toBeGreaterThan(0);
      });
    }
  }
});

describe('loadCodeSnippets', () => {
  it('reads .ts and .svelte files from a directory entry and skips images', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ega-vj-code-'));
    try {
      await fs.mkdir(path.join(root, 'dir'));
      await fs.writeFile(path.join(root, 'dir', 'a.ts'), 'export const a = 1;');
      await fs.writeFile(path.join(root, 'dir', 'b.svelte'), '<p>b</p>');
      await fs.writeFile(path.join(root, 'dir', 'c.png'), 'x');
      const snippets = await loadCodeSnippets(root, ['dir']);
      expect(snippets.map((s) => s.path).sort()).toEqual(['dir/a.ts', 'dir/b.svelte']);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('rejects when a code path is missing', async () => {
    await expect(loadCodeSnippets(os.tmpdir(), [`ega-missing-${Date.now()}`])).rejects.toThrow(
      /ENOENT/,
    );
  });
});
