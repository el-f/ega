import path from 'node:path';

export type JudgeMode = 'baseline' | 'diff' | 'audit';
export type Severity = 'ok' | 'minor' | 'major' | 'blocker';

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const CONFIG = {
  rubricRoot: path.resolve('tests/journeys/rubric'),
  runsRoot: path.resolve('tests/journeys/runs'),
  baselineRoot: path.resolve('tests/journeys/baseline'),
  reportRoot: path.resolve('tests/journeys/report'),
  // Sonnet 4.6 pins without a date; Haiku 4.5 pins with one. Both forms are correct.
  judgeModel: {
    baseline: 'claude-sonnet-4-6',
    diff: 'claude-haiku-4-5-20251001',
  } as const,
  concurrency: {
    baseline: 4,
    diff: 8,
  } as const,
  budgetUsd: {
    baseline: envNumber('EGA_UX_JUDGE_BUDGET_USD', 2.5),
    diff: envNumber('EGA_UX_JUDGE_BUDGET_USD', 0.3),
  } as const,
  rolls: { baseline: 3, diff: 1 } as const,
  preJudgePixelDiffSkipBelowPct: 0.5,
  maxTokens: 800,
} as const;
