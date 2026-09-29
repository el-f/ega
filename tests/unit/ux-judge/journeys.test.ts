import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadJourneys } from '../../../scripts/ux-judge/loader/journeys';
import { CONFIG } from '../../../scripts/ux-judge/config';

const A_B_C = path.join(CONFIG.runsRoot, 'a--b--c.json');
const A_X_C = path.join(CONFIG.runsRoot, 'a--x--c.json');
const D_E_F = path.join(CONFIG.runsRoot, 'd--e--f.json');

describe('loadJourneys', () => {
  beforeAll(async () => {
    await fs.mkdir(CONFIG.runsRoot, { recursive: true });
    const mk = (coverage: string) => ({ coverage, steps: [], latencies: [], outcome: 'passed' });
    await fs.writeFile(A_B_C, JSON.stringify(mk('a.b.c')));
    await fs.writeFile(A_X_C, JSON.stringify(mk('a.x.c')));
    await fs.writeFile(D_E_F, JSON.stringify(mk('d.e.f')));
  });

  afterAll(async () => {
    for (const f of [A_B_C, A_X_C, D_E_F]) await fs.rm(f, { force: true });
  });

  it('discovers JSON files under runsRoot', async () => {
    const all = await loadJourneys();
    const ids = all.map((j) => j.coverage);
    expect(ids).toContain('a.b.c');
    expect(ids).toContain('a.x.c');
    expect(ids).toContain('d.e.f');
  });

  it('filters by glob (a.*.c matches a.b.c and a.x.c, not d.e.f)', async () => {
    const filtered = await loadJourneys('a.*.c');
    const ids = filtered.map((j) => j.coverage).sort();
    expect(ids).toEqual(['a.b.c', 'a.x.c']);
  });

  it('lets * cross dots, the same as the journey visual judge (a.* matches a.b.c)', async () => {
    const filtered = await loadJourneys('a.*');
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
    const isolateRoot = path.resolve('runs-isolate-' + Date.now());
    await fs.mkdir(isolateRoot, { recursive: true });
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
