import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { BrowserContext, Page } from '@playwright/test';
import { dispatchStorageTool } from './storage';
import type { BrowserContextRef } from './browser';

function makeRef(evaluate: Mock): BrowserContextRef {
  return {
    context: {} as BrowserContext,
    page: { evaluate } as unknown as Page,
  };
}

describe('dispatchStorageTool', () => {
  it('storage_read forwards the key and returns the value', async () => {
    const evaluate = vi.fn(async () => ({ a: 1 }));
    const r = await dispatchStorageTool(makeRef(evaluate), 'storage_read', { key: 'foo' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toEqual({ a: 1 });
    expect(evaluate).toHaveBeenCalled();
  });

  it('storage_read errors when key is missing', async () => {
    const evaluate = vi.fn();
    const r = await dispatchStorageTool(makeRef(evaluate), 'storage_read', {});
    expect(r.ok).toBe(false);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('storage_write returns ok+written', async () => {
    const evaluate = vi.fn(async () => undefined);
    const r = await dispatchStorageTool(makeRef(evaluate), 'storage_write', {
      key: 'foo',
      value: { x: 1 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toBe('written');
  });

  it('storage_write errors when key missing', async () => {
    const evaluate = vi.fn();
    const r = await dispatchStorageTool(makeRef(evaluate), 'storage_write', { value: 1 });
    expect(r.ok).toBe(false);
  });

  it('returns error on unknown tool', async () => {
    const r = await dispatchStorageTool(makeRef(vi.fn()), 'storage_bogus', {});
    expect(r.ok).toBe(false);
  });

  it('captures evaluate exceptions as ok:false', async () => {
    const evaluate = vi.fn(async () => {
      throw new Error('eval blew up');
    });
    const r = await dispatchStorageTool(makeRef(evaluate), 'storage_read', { key: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('eval blew up');
  });
});
