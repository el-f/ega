import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { BrowserContext, Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeSpecStub } from './stub';
import { replayRecipe, replayThreeTimes } from './replay';
import type { BrowserContextRef } from '../agent/tools/browser';

function tmp(name: string): string {
  return path.join(
    os.tmpdir(),
    `explore-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}

function makeRef(evaluate?: Mock): BrowserContextRef {
  const close = vi.fn(async () => undefined);
  return {
    context: { close } as unknown as BrowserContext,
    page: {
      evaluate: evaluate ?? vi.fn(async () => 1),
      click: vi.fn(async () => undefined),
      fill: vi.fn(async () => undefined),
      waitForSelector: vi.fn(async () => undefined),
      waitForTimeout: vi.fn(async () => undefined),
      goto: vi.fn(async () => undefined),
      getByRole: vi.fn(() => ({ click: vi.fn(async () => undefined) })),
    } as unknown as Page,
  };
}

describe('writeSpecStub', () => {
  it('emits a Playwright spec stub with the coverage marker + materialized steps', async () => {
    const dir = tmp('stub');
    await fs.mkdir(dir, { recursive: true });
    const file = await writeSpecStub({
      sessionDir: dir,
      slug: 'broken-audit-rolling-50',
      goalId: 'break-audit-log',
      steps: [
        { tool: 'browser_navigate', input: { url: 'about:blank' } },
        { tool: 'browser_click', input: { selector: '.x' } },
        { tool: 'browser_type', input: { selector: '#in', value: 'hi' } },
        { tool: 'assert', input: { predicate: '1 + 1 === 3', claim: 'math is wrong' } },
      ],
      claim: 'audit log dropped a successful event',
    });
    const body = await fs.readFile(file, 'utf-8');
    expect(body).toContain('/* coverage: explore.break-audit-log.broken-audit-rolling-50 */');
    expect(body).toContain('about:blank');
    expect(body).toContain(`await page.fill("#in", "hi")`);
    expect(body).toContain('// assert: math is wrong');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('handles role+name clicks and a missing selector', async () => {
    const dir = tmp('stub-role');
    await fs.mkdir(dir, { recursive: true });
    const file = await writeSpecStub({
      sessionDir: dir,
      slug: 'role-click',
      goalId: 'desync',
      steps: [{ tool: 'browser_click', input: { role: 'button', name: 'Save' } }],
      claim: 'role click works',
    });
    const body = await fs.readFile(file, 'utf-8');
    expect(body).toContain(`getByRole("button", { name: "Save" }).click()`);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('escapes single quotes in the claim text', async () => {
    const dir = tmp('stub-quote');
    await fs.mkdir(dir, { recursive: true });
    const file = await writeSpecStub({
      sessionDir: dir,
      slug: 'q',
      goalId: 'x',
      steps: [],
      claim: "it's broken",
    });
    const body = await fs.readFile(file, 'utf-8');
    expect(body).toContain("it\\'s broken");
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('replayRecipe', () => {
  it('returns passed=true when an assert fails (the bug reproduces)', async () => {
    const evaluate = vi.fn(async () => 0); // predicate returns falsy → assert fails
    const ref = makeRef(evaluate);
    const r = await replayRecipe(ref, [
      { tool: 'browser_navigate', input: { url: 'about:blank' } },
      { tool: 'assert', input: { predicate: 'false', claim: 'always false' } },
    ]);
    expect(r.passed).toBe(true);
  });

  it('returns passed=false when every assert passes', async () => {
    const evaluate = vi.fn(async () => 1);
    const ref = makeRef(evaluate);
    const r = await replayRecipe(ref, [
      { tool: 'assert', input: { predicate: '1 === 1', claim: 'truth' } },
    ]);
    expect(r.passed).toBe(false);
  });

  it('skips audit_read in the replay', async () => {
    const evaluate = vi.fn(async () => 1);
    const ref = makeRef(evaluate);
    const r = await replayRecipe(ref, [{ tool: 'audit_read', input: {} }]);
    expect(r.passed).toBe(false);
    expect(evaluate).not.toHaveBeenCalled();
  });
});

describe('replayThreeTimes', () => {
  it('marks stable + stable-bug when all 3 rolls fail with matching observed', async () => {
    const refFactory = async (): Promise<BrowserContextRef> => makeRef(vi.fn(async () => 0));
    const result = await replayThreeTimes(refFactory, [
      { tool: 'assert', input: { predicate: 'false', claim: 'x' } },
    ]);
    expect(result.stable).toBe(true);
    expect(result.results.every((r) => r.passed)).toBe(true);
    expect(result.quality.kind).toBe('stable-bug');
  });

  it('marks stable + stable-pass when all 3 rolls pass', async () => {
    const refFactory = async (): Promise<BrowserContextRef> => makeRef(vi.fn(async () => 1));
    const result = await replayThreeTimes(refFactory, [
      { tool: 'assert', input: { predicate: 'true', claim: 'x' } },
    ]);
    expect(result.stable).toBe(true);
    expect(result.quality.kind).toBe('stable-pass');
  });

  it('marks unstable + partial when rolls diverge', async () => {
    let call = 0;
    const refFactory = async (): Promise<BrowserContextRef> => {
      call += 1;
      // First two rolls fail (truthy=0), third roll passes (truthy=1).
      return makeRef(vi.fn(async () => (call <= 2 ? 0 : 1)));
    };
    const result = await replayThreeTimes(refFactory, [
      { tool: 'assert', input: { predicate: 'flip', claim: 'flake' } },
    ]);
    expect(result.stable).toBe(false);
    expect(result.quality.kind).toBe('partial');
  });

  it('marks stable + drift when 3 fails diverge in observed values', async () => {
    let evalCall = 0;
    const refFactoryDrift = async (): Promise<BrowserContextRef> => {
      const distinct = vi.fn(async (_p: string) => {
        evalCall += 1;
        // All falsy (assert fails each roll) but observed differs per roll:
        // 0, '', null — distinct JSON serialisations → classifier reports drift.
        if (evalCall === 1) return 0;
        if (evalCall === 2) return '';
        return null;
      });
      return makeRef(distinct);
    };
    const result = await replayThreeTimes(refFactoryDrift, [
      { tool: 'assert', input: { predicate: 'drift', claim: 'drift' } },
    ]);
    expect(result.stable).toBe(true);
    expect(result.quality.kind).toBe('drift');
  });
});
