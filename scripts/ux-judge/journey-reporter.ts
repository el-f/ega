/** Playwright reporter: writes one journey JSON per flow-spec coverage id for the UX judge. playwright.config.ts adds it when EGA_UX_RECORD=1. */
import fs from 'node:fs';
import path from 'node:path';
import type { Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import { CONFIG } from './config';
import { coverageIdOf } from './coverage-marker';
import type { JourneyLatency, JourneyRecord, JourneyStep } from './loader/journeys';

const KIND: Readonly<Record<string, string>> = {
  'pw:api': 'action',
  expect: 'assert',
  'test.step': 'step',
};
const OUTCOME_RANK: Readonly<Record<JourneyRecord['outcome'], number>> = {
  passed: 0,
  failed: 1,
  error: 2,
};

interface TestRun {
  title: string;
  outcome: JourneyRecord['outcome'];
  steps: JourneyStep[];
  latencies: JourneyLatency[];
  tracePath?: string;
}

function outcomeOf(status: TestResult['status']): JourneyRecord['outcome'] {
  if (status === 'passed') return 'passed';
  return status === 'failed' || status === 'timedOut' ? 'failed' : 'error';
}

// Playwright titles are generic ("Click", "Evaluate"); the spec line says what was clicked.
function withSource(s: TestStep, sourceLines: Map<string, readonly string[]>): string {
  const loc = s.location;
  if (!loc) return s.title;
  let lines = sourceLines.get(loc.file);
  if (!lines) {
    lines = fs.readFileSync(loc.file, 'utf8').split('\n');
    sourceLines.set(loc.file, lines);
  }
  const line = lines[loc.line - 1]?.trim();
  return line ? `${s.title}: ${line}` : s.title;
}

// Hooks and fixtures are setup (launch, seed); an assertion's children are expect.poll retries.
function collect(
  steps: readonly TestStep[],
  t0: number,
  run: TestRun,
  sourceLines: Map<string, readonly string[]>,
): void {
  for (const s of steps) {
    if (s.category === 'hook' || s.category === 'fixture') continue;
    const kind = KIND[s.category];
    if (kind) {
      const expr = withSource(s, sourceLines);
      run.steps.push({ at: s.startTime.getTime() - t0, kind, expr, passed: !s.error });
      if (kind === 'assert') {
        run.latencies.push({ name: expr, ms: s.duration });
        continue;
      }
    }
    collect(s.steps, t0, run, sourceLines);
  }
}

export default class JourneyReporter implements Reporter {
  private readonly coverageByFile = new Map<string, string | null>();
  private readonly runs = new Map<string, Map<string, TestRun>>();
  private readonly sourceLines = new Map<string, readonly string[]>();

  private coverageOf(file: string): string | null {
    if (!this.coverageByFile.has(file)) {
      this.coverageByFile.set(file, coverageIdOf(fs.readFileSync(file, 'utf8')));
    }
    return this.coverageByFile.get(file) ?? null;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'skipped') return;
    const coverage = this.coverageOf(test.location.file);
    if (!coverage) return;
    const run: TestRun = {
      title: test.title,
      outcome: outcomeOf(result.status),
      steps: [],
      latencies: [],
    };
    collect(result.steps, result.startTime.getTime(), run, this.sourceLines);
    const trace = result.attachments.find((a) => a.name === 'trace')?.path;
    if (trace) run.tracePath = trace;
    const byTest = this.runs.get(coverage) ?? new Map<string, TestRun>();
    // A retry reports again under the same id; the last attempt is the one that counts.
    byTest.set(test.id, run);
    this.runs.set(coverage, byTest);
  }

  onEnd(): void {
    if (this.runs.size === 0) return;
    const dir = process.env['EGA_UX_RECORD_DIR'] ?? CONFIG.runsRoot;
    fs.mkdirSync(dir, { recursive: true });
    for (const [coverage, byTest] of this.runs) {
      const tests = [...byTest.values()];
      const worst = tests.reduce<JourneyRecord['outcome']>(
        (acc, t) => (OUTCOME_RANK[t.outcome] > OUTCOME_RANK[acc] ? t.outcome : acc),
        'passed',
      );
      const tracePath = tests.find((t) => t.tracePath)?.tracePath;
      const record: JourneyRecord = {
        coverage,
        steps: tests.flatMap((t) => [{ at: 0, kind: 'test', expr: t.title }, ...t.steps]),
        latencies: tests.flatMap((t) => t.latencies),
        outcome: worst,
        ...(tracePath ? { tracePath } : {}),
      };
      fs.writeFileSync(
        path.join(dir, `${coverage.replace(/\./g, '--')}.json`),
        JSON.stringify(record, null, 2),
      );
    }
  }
}
