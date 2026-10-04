// @vitest-environment node
// lefthook refuses a global core.hooksPath; pnpm install must not die at the prepare step over it.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');

describe('scripts/prepare.mjs', () => {
  it('exits 0 when git resolves core.hooksPath outside the repo', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ega-prepare-'));
    try {
      const hooks = path.join(tmp, 'global-hooks');
      mkdirSync(hooks);
      const gitconfig = path.join(tmp, 'gitconfig');
      writeFileSync(gitconfig, `[core]\n\thooksPath = ${hooks.replaceAll('\\', '/')}\n`);
      const repo = path.join(tmp, 'repo');
      expect(spawnSync('git', ['init', '-q', repo]).status).toBe(0);
      const PATH = `${path.join(repoRoot, 'node_modules', '.bin')}${path.delimiter}${process.env['PATH'] ?? ''}`;
      const r = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'prepare.mjs')], {
        cwd: repo,
        env: { ...process.env, GIT_CONFIG_GLOBAL: gitconfig, PATH, Path: PATH },
        encoding: 'utf8',
      });
      expect(r.status, r.stderr).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    // Three cold process spawns (git, node, lefthook): seconds on Windows under load.
  }, 30_000);
});
