import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { BrowserContext, Page } from '@playwright/test';
import { dispatchAuditTool } from './audit';
import type { BrowserContextRef } from './browser';

function makeRef(evaluate: Mock): BrowserContextRef {
  return {
    context: {} as BrowserContext,
    page: { evaluate } as unknown as Page,
  };
}

describe('dispatchAuditTool', () => {
  it('reads the rolling log', async () => {
    const entries = [{ id: '1' }, { id: '2' }];
    const evaluate = vi.fn(async () => entries);
    const r = await dispatchAuditTool(makeRef(evaluate), 'audit_read');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toEqual(entries);
  });

  it('returns error on unknown tool', async () => {
    const r = await dispatchAuditTool(makeRef(vi.fn()), 'audit_clear');
    expect(r.ok).toBe(false);
  });

  it('captures evaluate failure as ok:false', async () => {
    const evaluate = vi.fn(async () => {
      throw new Error('storage missing');
    });
    const r = await dispatchAuditTool(makeRef(evaluate), 'audit_read');
    expect(r.ok).toBe(false);
  });
});
