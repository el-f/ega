import path from 'node:path';

export type JudgeMode = 'baseline' | 'diff';
export type Severity = 'ok' | 'minor' | 'major' | 'blocker';

export const SEVERITY_ORDER: Record<Severity, number> = {
  ok: 0,
  minor: 1,
  major: 2,
  blocker: 3,
};

export const CONFIG = {
  rubricRoot: path.resolve('tests/journeys/rubric'),
  runsRoot: path.resolve('tests/journeys/runs'),
  baselineRoot: path.resolve('tests/journeys/baseline'),
  reportRoot: path.resolve('tests/journeys/report'),
  framesRoot: path.resolve('tests/journeys/frames'),
  // Sonnet 4.6 pins without a date; Haiku 4.5 pins with one. Both forms are correct.
  judgeModel: {
    baseline: 'claude-sonnet-4-6',
    diff: 'claude-haiku-4-5-20251001',
  } as const,
  concurrency: {
    baseline: 4,
    diff: 8,
  } as const,
  rolls: { baseline: 3 } as const,
  maxTokens: 800,
} as const;
