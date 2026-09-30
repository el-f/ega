import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadJourneys } from '../../../scripts/ux-judge/loader/journeys';
import { CONFIG } from '../../../scripts/ux-judge/config';

let root: string;

describe('loadJourneys', () => {
  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ega-ux-runs-'));
    const mk = (coverage: string) => ({ coverage, steps: [], latencies: [], outcome: 'passed' });
    await fs.writeFile(path.join(root, 'a--b--c.json'), JSON.stringify(mk('a.b.c')));
    await fs.writeFile(path.join(root, 'a--x--c.json'), JSON.stringify(mk('a.x.c')));
    await fs.writeFile(path.join(root, 'd--e--f.json'), JSON.stringify(mk('d.e.f')));
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('discovers JSON files under runsRoot', async () => {
    const all = await loadJourneys(undefined, root);
    const ids = all.map((j) => j.coverage);
    expect(ids).toContain('a.b.c');
    expect(ids).toContain('a.x.c');
    expect(ids).toContain('d.e.f');
  });

  it('filters by glob (a.*.c matches a.b.c and a.x.c, not d.e.f)', async () => {
    const filtered = await loadJourneys('a.*.c', root);
    const ids = filtered.map((j) => j.coverage).sort();
    expect(ids).toEqual(['a.b.c', 'a.x.c']);
  });

  it('lets * cross dots, the same as the journey visual judge (a.* matches a.b.c)', async () => {
    const filtered = await loadJourneys('a.*', root);
    const ids = filtered.map((j) => j.coverage).sort();
    expect(ids).toEqual(['a.b.c', 'a.x.c']);
  });

  it('returns empty array when runs dir missing', async () => {
    const oldRoot = CONFIG.runsRoot;
    // Aim at a deliberately absent path via override.
    process.env['EGA_UX_RUNS_OVERRIDE'] = path.resolve('no-such-dir-' + Date.now());
    const empty = await loadJourneys('nothing.matches.me');
    expect(empty).toEqual([]);
    delete process.env['EGA_UX_RUNS_OVERRIDE'];
    expect(oldRoot).toBe(CONFIG.runsRoot);
  });

  it('isolates malformed JSON: skips bad file, loads the rest, warns once', async () => {
    const isolateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ega-ux-isolate-'));
    const goodFile = path.join(isolateRoot, 'good.json');
    const badFile = path.join(isolateRoot, 'malformed.json');
    await fs.writeFile(
      goodFile,
      JSON.stringify({ coverage: 'iso.good.one', steps: [], latencies: [], outcome: 'passed' }),
    );
    await fs.writeFile(badFile, '{ not valid json }');
    process.env['EGA_UX_RUNS_OVERRIDE'] = isolateRoot;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const records = await loadJourneys();
      const ids = records.map((r) => r.coverage);
      expect(ids).toContain('iso.good.one');
      expect(ids).not.toContain('iso.malformed');
      expect(warn).toHaveBeenCalledTimes(1);
      const msg = String(warn.mock.calls[0]?.[0] ?? '');
      expect(msg).toContain('malformed.json');
      expect(msg).toMatch(/skipped 1/);
    } finally {
      warn.mockRestore();
      delete process.env['EGA_UX_RUNS_OVERRIDE'];
      await fs.rm(isolateRoot, { recursive: true, force: true });
    }
  });
});
