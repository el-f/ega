import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeRunMarkdown } from '../../../scripts/ux-judge/report/md';
import { writeRunJson, type RunRow } from '../../../scripts/ux-judge/report/json';
import { promoteBaseline } from '../../../scripts/ux-judge/report/baseline';

const RUN_ID = 'unit-test-report';
const D1 = '1999-01-01';
const D2 = '1999-01-02';

let root: string;
let reportRoot: string;
let baselineRoot: string;
let history: string;
let current: string;

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

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ega-ux-report-'));
  reportRoot = path.join(root, 'report');
  baselineRoot = path.join(root, 'baseline');
  history = path.join(baselineRoot, 'history');
  current = path.join(baselineRoot, 'current.json');
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('reporters', () => {
  it('writeRunMarkdown drops summary + section per non-ok row', async () => {
    const file = await writeRunMarkdown(rows, RUN_ID, reportRoot);
    const body = await fs.readFile(file, 'utf-8');
    expect(body).toContain('Summary: ok 1');
    expect(body).toContain('blocker 0');
    expect(body).toContain('`d.e.f` — major');
    expect(body).toContain('motion');
    expect(body).not.toContain('a.b.c'); // ok rows skipped
  });

  it('writeRunJson produces parseable JSON with runId + rows', async () => {
    const file = await writeRunJson(rows, RUN_ID, reportRoot);
    const parsed = JSON.parse(await fs.readFile(file, 'utf-8')) as {
      runId: string;
      rows: RunRow[];
    };
    expect(parsed.runId).toBe(RUN_ID);
    expect(parsed.rows).toHaveLength(2);
  });

  it('promoteBaseline writes current.json + history/<date>.json atomically', async () => {
    await fs.rm(current, { force: true });
    await fs.rm(path.join(history, `${D2}.json`), { force: true });
    const file = await promoteBaseline(rows, D2, baselineRoot);
    expect(file).toBe(current);
    const cur = JSON.parse(await fs.readFile(current, 'utf-8')) as { rows: RunRow[] };
    expect(cur.rows).toHaveLength(2);
    const archive = JSON.parse(await fs.readFile(path.join(history, `${D2}.json`), 'utf-8')) as {
      rows: RunRow[];
    };
    expect(archive.rows).toHaveLength(2);
  });

  it('promoteBaseline moves prior current into history before overwriting', async () => {
    // First promotion plants a prior current.
    await promoteBaseline(rows, D1, baselineRoot);
    // Now promote a different date and confirm the prior pointer lands in history.
    await promoteBaseline(rows, D2, baselineRoot);
    const priorPath = path.join(history, `${D1}-prior.json`);
    const exists = await fs
      .stat(priorPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });
});
