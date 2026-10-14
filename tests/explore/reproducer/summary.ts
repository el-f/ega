import fs from 'node:fs/promises';
import path from 'node:path';
import type { SessionOutcome } from '../agent/loop';
import type { ReplayKind } from '../agent/replay-kinds';
import { CONFIG } from '../config';

export interface FindingRecord {
  index: number;
  claim: string;
  kind: ReplayKind;
  /** 0..1 — replay quality confidence. */
  confidence: number;
  /** Number of replay rolls (of 3) where at least one assert failed. */
  passedRolls: number;
  /** Spec stub path, relative to sessionDir, when one was written. */
  stubPath: string | undefined;
}

export interface WriteSessionSummaryOptions {
  sessionDir: string;
  goalId: string;
  session: SessionOutcome;
  findings: ReadonlyArray<FindingRecord>;
}

/** Human-readable interest score: stable-bug > drift > partial > stable-pass. */
const KIND_INTEREST: Record<ReplayKind, number> = {
  'stable-bug': 3,
  drift: 2,
  partial: 1,
  'stable-pass': 0,
};

function recommendedAction(f: FindingRecord): string {
  if (f.kind === 'stable-bug') return 'promote to flow spec';
  if (f.kind === 'drift') return 'triage (env-dependent)';
  if (f.kind === 'partial') return 'triage (flaky)';
  return 'dismiss (cannot reproduce)';
}

function topThree(findings: ReadonlyArray<FindingRecord>): ReadonlyArray<FindingRecord> {
  return [...findings]
    .sort((a, b) => {
      const ai = KIND_INTEREST[a.kind];
      const bi = KIND_INTEREST[b.kind];
      if (ai !== bi) return bi - ai;
      return b.confidence - a.confidence;
    })
    .slice(0, 3);
}

function countByKind(findings: ReadonlyArray<FindingRecord>): Record<ReplayKind, number> {
  const acc: Record<ReplayKind, number> = {
    'stable-bug': 0,
    'stable-pass': 0,
    partial: 0,
    drift: 0,
  };
  for (const f of findings) acc[f.kind] += 1;
  return acc;
}

/** Writes <sessionDir>/SUMMARY.md: outcome, finding counts, stubs, step budget and top findings. */
export async function writeSessionSummary(opts: WriteSessionSummaryOptions): Promise<string> {
  const { sessionDir, goalId, session, findings } = opts;
  const counts = countByKind(findings);
  const stubs = findings.filter((f) => f.stubPath !== undefined).length;
  const top = topThree(findings);

  const lines: string[] = [];
  lines.push(`# Session summary: ${goalId}`);
  lines.push('');
  lines.push(`- Outcome: \`${session.outcome}\``);
  lines.push(`- Steps: ${session.steps} / ${CONFIG.stepBudget}`);
  lines.push(`- Findings: ${findings.length}`);
  lines.push(`- Stubs written: ${stubs}`);
  lines.push('');
  lines.push('## Findings by kind');
  lines.push('');
  lines.push(`- stable-bug: ${counts['stable-bug']}`);
  lines.push(`- drift: ${counts.drift}`);
  lines.push(`- partial: ${counts.partial}`);
  lines.push(`- stable-pass: ${counts['stable-pass']}`);
  lines.push('');
  if (top.length > 0) {
    lines.push('## Top findings');
    lines.push('');
    for (const f of top) {
      const conf = (f.confidence * 100).toFixed(0);
      lines.push(`- [${f.kind} · ${conf}% · ${f.passedRolls}/3] ${f.claim}`);
      lines.push(`  - Recommended: ${recommendedAction(f)}`);
      if (f.stubPath !== undefined) {
        lines.push(`  - Stub: \`${f.stubPath}\``);
      }
    }
    lines.push('');
  }
  if (findings.length === 0) {
    lines.push('## Recommendation');
    lines.push('');
    lines.push('- No findings. Re-run with different goal or larger step budget.');
    lines.push('');
  }

  const file = path.join(sessionDir, 'SUMMARY.md');
  await fs.writeFile(file, lines.join('\n'));
  return file;
}
