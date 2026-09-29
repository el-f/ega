/** Writes to the real tests/journeys/report and baseline folders and cleans up afterwards. */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeRunMarkdown } from '../../../scripts/ux-judge/report/md';
import { writeRunJson, type RunRow } from '../../../scripts/ux-judge/report/json';
import { promoteBaseline } from '../../../scripts/ux-judge/report/baseline';
import { CONFIG } from '../../../scripts/ux-judge/config';

const RUN_ID = 'unit-test-report';
const HISTORY = path.join(CONFIG.baselineRoot, 'history');
const CURRENT = path.join(CONFIG.baselineRoot, 'current.json');
// promoteBaseline writes into the real baseline dir — a date matching a committed fixture overwrites it.
const D1 = '1999-01-01';
const D2 = '1999-01-02';

const rows: RunRow[] = [
  {
    coverage: 'a.b.c',
    verdict: { severity: 'ok', findings: [], suggestions: [] },
    judgeModel: 'test',
    at: '2026-05-20T00:00:00Z',
  },
  {
    coverage: 'd.e.f',
    verdict: {
      severity: 'major',
      findings: [{ axis: 'motion', where: 'step 1', issue: 'jank' }],
      suggestions: ['fix easing'],
    },
    judgeModel: 'test',
    at: '2026-05-20T00:00:00Z',
  },
];

afterAll(async () => {
  await fs.rm(path.join(CONFIG.reportRoot, `${RUN_ID}.md`), { force: true });
  await fs.rm(path.join(CONFIG.reportRoot, `${RUN_ID}.json`), { force: true });
  await fs.rm(CURRENT, { force: true });
  for (const d of [D1, D2]) {
    await fs.rm(path.join(HISTORY, `${d}.json`), { force: true });
    await fs.rm(path.join(HISTORY, `${d}-prior.json`), { force: true });
  }
});

describe('reporters', () => {
  it('writeRunMarkdown drops summary + section per non-ok row', async () => {
    const file = await writeRunMarkdown(rows, RUN_ID);
    const body = await fs.readFile(file, 'utf-8');
    expect(body).toContain('Summary: ok 1');
    expect(body).toContain('blocker 0');
    expect(body).toContain('`d.e.f` — major');
    expect(body).toContain('motion');
    expect(body).not.toContain('a.b.c'); // ok rows skipped
  });

  it('writeRunJson produces parseable JSON with runId + rows', async () => {
    const file = await writeRunJson(rows, RUN_ID);
    const parsed = JSON.parse(await fs.readFile(file, 'utf-8')) as {
      runId: string;
      rows: RunRow[];
    };
    expect(parsed.runId).toBe(RUN_ID);
    expect(parsed.rows).toHaveLength(2);
  });

  it('promoteBaseline writes current.json + history/<date>.json atomically', async () => {
    await fs.rm(CURRENT, { force: true });
    await fs.rm(path.join(HISTORY, `${D2}.json`), { force: true });
    const file = await promoteBaseline(rows, D2);
    expect(file).toBe(CURRENT);
    const cur = JSON.parse(await fs.readFile(CURRENT, 'utf-8')) as { rows: RunRow[] };
    expect(cur.rows).toHaveLength(2);
    const archive = JSON.parse(await fs.readFile(path.join(HISTORY, `${D2}.json`), 'utf-8')) as {
      rows: RunRow[];
    };
    expect(archive.rows).toHaveLength(2);
  });

  it('promoteBaseline moves prior current into history before overwriting', async () => {
    // First promotion plants a prior current.
    await promoteBaseline(rows, D1);
    // Now promote a different date and confirm the prior pointer lands in history.
    await promoteBaseline(rows, D2);
    const priorPath = path.join(HISTORY, `${D1}-prior.json`);
    const exists = await fs
      .stat(priorPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });
});
