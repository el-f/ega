import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeRunMarkdown } from '../../../scripts/ux-judge/report/md';
import { writeRunJson, type RunRow } from '../../../scripts/ux-judge/report/json';

const RUN_ID = 'unit-test-report';

let root: string;
let reportRoot: string;

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
});
