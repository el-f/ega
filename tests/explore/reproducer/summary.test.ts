import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeSessionSummary, type FindingRecord } from './summary';
import type { SessionOutcome } from '../agent/loop';

function tmp(name: string): string {
  return path.join(
    os.tmpdir(),
    `explore-summary-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}

const session: SessionOutcome = {
  outcome: 'bug-found',
  steps: 7,
  findings: [],
  recipe: [],
};

describe('writeSessionSummary', () => {
  it('renders goal id, outcome, step usage, finding counts, and stubs', async () => {
    const dir = tmp('basic');
    await fs.mkdir(dir, { recursive: true });
    const findings: FindingRecord[] = [
      {
        index: 0,
        claim: 'audit log dropped event',
        kind: 'stable-bug',
        confidence: 1,
        passedRolls: 3,
        stubPath: 'repro/x.flow.spec.ts',
      },
      {
        index: 1,
        claim: 'flaky on second run',
        kind: 'partial',
        confidence: 2 / 3,
        passedRolls: 2,
        stubPath: undefined,
      },
    ];
    const file = await writeSessionSummary({
      sessionDir: dir,
      goalId: 'break-audit-log',
      session,
      findings,
    });
    const body = await fs.readFile(file, 'utf-8');
    expect(body).toContain('# Session summary: break-audit-log');
    expect(body).toContain('Outcome: `bug-found`');
    expect(body).toContain('Findings: 2');
    expect(body).toContain('Stubs written: 1');
    expect(body).toContain('stable-bug: 1');
    expect(body).toContain('partial: 1');
    expect(body).toContain('audit log dropped event');
    expect(body).toContain('flaky on second run');
    expect(body).toContain('promote to flow spec');
    expect(body).toContain('triage (flaky)');
    expect(body).toContain('repro/x.flow.spec.ts');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('ranks top 3 findings by kind interest, breaking ties on confidence', async () => {
    const dir = tmp('top3');
    await fs.mkdir(dir, { recursive: true });
    const findings: FindingRecord[] = [
      {
        index: 0,
        claim: 'cannot repro A',
        kind: 'stable-pass',
        confidence: 1,
        passedRolls: 0,
        stubPath: undefined,
      },
      {
        index: 1,
        claim: 'drift B',
        kind: 'drift',
        confidence: 1,
        passedRolls: 3,
        stubPath: undefined,
      },
      {
        index: 2,
        claim: 'stable bug C',
        kind: 'stable-bug',
        confidence: 1,
        passedRolls: 3,
        stubPath: undefined,
      },
      {
        index: 3,
        claim: 'partial D',
        kind: 'partial',
        confidence: 2 / 3,
        passedRolls: 2,
        stubPath: undefined,
      },
    ];
    const file = await writeSessionSummary({ sessionDir: dir, goalId: 'g', session, findings });
    const body = await fs.readFile(file, 'utf-8');
    const idxBug = body.indexOf('stable bug C');
    const idxDrift = body.indexOf('drift B');
    const idxPartial = body.indexOf('partial D');
    const idxPass = body.indexOf('cannot repro A');
    // First 3 (in Top findings block) are stable-bug, drift, partial.
    // stable-pass falls off the top-3 list.
    expect(idxBug).toBeGreaterThan(-1);
    expect(idxDrift).toBeGreaterThan(idxBug);
    expect(idxPartial).toBeGreaterThan(idxDrift);
    expect(idxPass).toBe(-1);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('notes empty findings list explicitly', async () => {
    const dir = tmp('empty');
    await fs.mkdir(dir, { recursive: true });
    const file = await writeSessionSummary({ sessionDir: dir, goalId: 'g', session, findings: [] });
    const body = await fs.readFile(file, 'utf-8');
    expect(body).toContain('No findings.');
    await fs.rm(dir, { recursive: true, force: true });
  });
});
