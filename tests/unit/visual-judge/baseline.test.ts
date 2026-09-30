import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBaseline } from '../../../scripts/visual-judge/cli/baseline';
import { buildPaths, type JudgePaths } from '../../../scripts/visual-judge/config';
import type { BaselineVerdictMap, BatchReport } from '../../../scripts/visual-judge/judge/types';

let root: string;
let paths: JudgePaths;

function verdict(file: string, overall: 'ok' | 'major-issues'): BatchReport['files'][number] {
  return { file, surface: 'popup', state: 'default', overall, issues: [] };
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'ega-vj-baseline-'));
  paths = buildPaths(root);
  await mkdir(paths.currentDir, { recursive: true });
  await mkdir(paths.baselineDir, { recursive: true });
  await writeFile(path.join(paths.currentDir, 'a.png'), 'A');
  await writeFile(path.join(paths.currentDir, 'b.png'), 'B');
  await writeFile(path.join(paths.baselineDir, 'retired.png'), 'R');
  const report = { files: [verdict('a.png', 'ok'), verdict('b.png', 'major-issues')] };
  await writeFile(paths.reportJson, JSON.stringify(report));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

async function readVerdicts(): Promise<BaselineVerdictMap> {
  return JSON.parse(await readFile(paths.baselineVerdict, 'utf8')) as BaselineVerdictMap;
}

describe('runBaseline', () => {
  it('promotes every current shot, drops retired ones and writes their verdicts', async () => {
    expect(await runBaseline(undefined, paths)).toEqual({ exitCode: 0 });
    expect((await readdir(paths.baselineDir)).sort()).toEqual(['a.png', 'b.png']);
    const map = await readVerdicts();
    expect(map['a.png']?.overall).toBe('ok');
    expect(map['b.png']?.overall).toBe('major-issues');
  });

  it('with one shot, keeps the other baselines and merges into the prior verdicts', async () => {
    const prior: BaselineVerdictMap = {
      'old.png': { overall: 'ok', issues: [], surface: 'popup', state: 'default' },
    };
    await writeFile(paths.baselineVerdict, JSON.stringify(prior));
    expect(await runBaseline('a', paths)).toEqual({ exitCode: 0 });
    expect((await readdir(paths.baselineDir)).sort()).toEqual(['a.png', 'retired.png']);
    expect(Object.keys(await readVerdicts()).sort()).toEqual(['a.png', 'old.png']);
  });

  it('exits 2 when current/ is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await rm(paths.currentDir, { recursive: true });
    expect(await runBaseline(undefined, paths)).toEqual({ exitCode: 2 });
  });
});
