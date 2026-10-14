import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import JourneyReporter from '../../../scripts/ux-judge/journey-reporter';
import { loadJourneys } from '../../../scripts/ux-judge/loader/journeys';

const T0 = new Date('2026-01-01T00:00:00Z');

function step(
  category: string,
  title: string,
  at: number,
  extra: Partial<TestStep> = {},
): TestStep {
  return {
    category,
    title,
    startTime: new Date(T0.getTime() + at),
    duration: 40,
    steps: [],
    ...extra,
  } as unknown as TestStep;
}

function result(status: TestResult['status'], steps: TestStep[], retry = 0): TestResult {
  return { status, retry, startTime: T0, steps, attachments: [] } as unknown as TestResult;
}

function testCase(file: string, title: string): TestCase {
  return { id: `${file}:${title}`, title, location: { file, line: 1, column: 1 } } as TestCase;
}

let dir: string;
let spec: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ega-journey-reporter-'));
  spec = path.join(dir, 'copy-button.flow.spec.ts');
  fs.writeFileSync(spec, '/* coverage: translation.tooltip.copy-button */\nimport x from "y";\n');
  process.env['EGA_UX_RECORD_DIR'] = path.join(dir, 'runs');
});

afterEach(() => {
  delete process.env['EGA_UX_RECORD_DIR'];
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('JourneyReporter', () => {
  it('writes one journey per coverage id that the judge loader reads back', async () => {
    const r = new JourneyReporter();
    r.onTestEnd(
      testCase(spec, 'copies the translation'),
      result('passed', [
        step('hook', 'Before Hooks', 0, { steps: [step('pw:api', 'page.goto(options)', 1)] }),
        step('pw:api', "locator.click(getByRole('button', { name: 'Copy' }))", 100),
        step('expect', 'expect(locator).toBeVisible()', 150),
        step('test.step', 'paste', 200, {
          steps: [step('pw:api', 'keyboard.press(Control+V)', 210)],
        }),
      ]),
    );
    r.onEnd();

    const [j, ...rest] = await loadJourneys();
    expect(rest).toHaveLength(0);
    if (!j) throw new Error('no journey written');
    expect(j.coverage).toBe('translation.tooltip.copy-button');
    expect(j.outcome).toBe('passed');
    expect(j.steps.map((s) => [s.kind, s.expr])).toEqual([
      ['test', 'copies the translation'],
      ['action', "locator.click(getByRole('button', { name: 'Copy' }))"],
      ['assert', 'expect(locator).toBeVisible()'],
      ['step', 'paste'],
      ['action', 'keyboard.press(Control+V)'],
    ]);
    expect(j.steps[1]?.at).toBe(100);
    expect(j.latencies).toEqual([{ name: 'expect(locator).toBeVisible()', ms: 40 }]);
  });

  it('adds the source line a step came from and skips the retries inside an assertion', async () => {
    fs.writeFileSync(
      spec,
      "/* coverage: translation.tooltip.copy-button */\n  await page.getByRole('button', { name: 'Copy' }).click();\n  await expect.poll(() => copied()).toBe(true);\n",
    );
    const r = new JourneyReporter();
    r.onTestEnd(
      testCase(spec, 'copies'),
      result('passed', [
        step('pw:api', 'Click', 10, { location: { file: spec, line: 2, column: 3 } }),
        step('expect', 'Expect "poll toBe"', 20, {
          location: { file: spec, line: 3, column: 3 },
          steps: [step('expect', 'Expect "toBe"', 21, { error: { message: 'retry' } })],
        }),
      ]),
    );
    r.onEnd();

    const [j] = await loadJourneys();
    expect(j?.steps.map((s) => [s.kind, s.expr, s.passed])).toEqual([
      ['test', 'copies', undefined],
      ['action', "Click: await page.getByRole('button', { name: 'Copy' }).click();", true],
      ['assert', 'Expect "poll toBe": await expect.poll(() => copied()).toBe(true);', true],
    ]);
  });

  it('keeps only the last attempt of a retried test and reports the worst outcome of the file', () => {
    const r = new JourneyReporter();
    r.onTestEnd(testCase(spec, 'a'), result('failed', [step('pw:api', 'first try', 1)]));
    r.onTestEnd(testCase(spec, 'a'), result('passed', [step('pw:api', 'second try', 1)], 1));
    r.onTestEnd(testCase(spec, 'b'), result('timedOut', [step('pw:api', 'b action', 1)]));
    r.onEnd();

    const file = path.join(dir, 'runs', 'translation--tooltip--copy-button.json');
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      outcome: string;
      steps: Array<{ expr: string }>;
    };
    expect(j.outcome).toBe('failed');
    expect(j.steps.map((s) => s.expr)).toEqual(['a', 'second try', 'b', 'b action']);
  });

  it('records nothing for a skipped test or a spec with no coverage marker', () => {
    const plain = path.join(dir, 'smoke.spec.ts');
    fs.writeFileSync(plain, 'import x from "y";\n');
    const r = new JourneyReporter();
    r.onTestEnd(testCase(plain, 'smoke'), result('passed', [step('pw:api', 'x', 1)]));
    r.onTestEnd(testCase(spec, 'skipped one'), result('skipped', []));
    r.onEnd();
    expect(fs.existsSync(path.join(dir, 'runs'))).toBe(false);
  });
});
