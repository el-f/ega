import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { BrowserContext, Page } from '@playwright/test';
import { dispatchAssertTool } from './assert';
import type { BrowserContextRef } from './browser';

function makeRef(evaluate: Mock): BrowserContextRef {
  return {
    context: {} as BrowserContext,
    page: { evaluate } as unknown as Page,
  };
}

describe('dispatchAssertTool', () => {
  it('marks passed=true when predicate evaluates truthy', async () => {
    const evaluate = vi.fn(async () => 1);
    const r = await dispatchAssertTool(makeRef(evaluate), 'assert', {
      predicate: '1 === 1',
      claim: 'always true',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.passed).toBe(true);
      expect(r.result.predicate).toBe('1 === 1');
      expect(r.result.claim).toBe('always true');
    }
  });

  it('marks passed=false when predicate evaluates falsy', async () => {
    const evaluate = vi.fn(async () => 0);
    const r = await dispatchAssertTool(makeRef(evaluate), 'assert', {
      predicate: '1 === 2',
      claim: 'never true',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result.passed).toBe(false);
  });

  it('captures predicate eval throws as passed=false', async () => {
    const evaluate = vi.fn(async () => {
      throw new Error('reference err');
    });
    const r = await dispatchAssertTool(makeRef(evaluate), 'assert', {
      predicate: 'doesNotExist.x',
      claim: 'should not exist',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.passed).toBe(false);
      expect(r.result.observed).toBe('reference err');
    }
  });

  it('rejects missing predicate', async () => {
    const r = await dispatchAssertTool(makeRef(vi.fn()), 'assert', { claim: 'x' });
    expect(r.ok).toBe(false);
  });

  it('rejects unknown tool', async () => {
    const r = await dispatchAssertTool(makeRef(vi.fn()), 'asserts_all', {
      predicate: 'true',
      claim: 'x',
    });
    expect(r.ok).toBe(false);
  });
});
