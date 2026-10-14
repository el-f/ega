import path from 'node:path';

export interface JudgePaths {
  root: string;
  auditDir: string;
  currentDir: string;
  baselineDir: string;
  metaDir: string;
  rubricDir: string;
  reportJson: string;
  reportMd: string;
  baselineVerdict: string;
  proposalsDir: string;
}

export function buildPaths(root: string = process.cwd()): JudgePaths {
  const auditDir = path.join(root, 'tests', 'screenshots', 'audit');
  return {
    root,
    auditDir,
    currentDir: path.join(auditDir, 'current'),
    baselineDir: path.join(auditDir, 'baseline'),
    metaDir: path.join(auditDir, 'meta'),
    rubricDir: path.join(auditDir, 'rubric'),
    reportJson: path.join(auditDir, 'report.json'),
    reportMd: path.join(auditDir, 'REPORT.md'),
    baselineVerdict: path.join(auditDir, 'baseline-verdict.json'),
    proposalsDir: path.join(auditDir, 'proposals'),
  };
}

// Below this a shot counts as unchanged and inherits the baseline verdict; above it the LLM runs.
export const UNCHANGED_THRESHOLD_PCT = 1;

export const SHOT_TIMEOUT_MS = 120_000;

export const FEATURE_TIMEOUT_MS = 240_000;

// Above this, shots are sampled evenly to keep the prompt inside the model context.
export const MAX_SHOTS_PER_FEATURE = 16;

// Above this, the loader trims the longest files first.
export const MAX_CODE_BYTES_PER_FEATURE = 64 * 1024;
