import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ensureCustomLanguages,
  installCustomLanguagesInvalidator,
  resetCustomLanguagesCache,
} from '@/content/customs-cache';
import { upsertCustomLanguage } from '@/shared/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import { preset } from '@tests/_helpers/lang';
import { chromeMock } from '@tests/mocks/chrome';

describe('customs-cache', () => {
  beforeEach(() => {
    resetCustomLanguagesCache();
  });

  it('memoizes the first getCustomLanguages read across calls', async () => {
    await upsertCustomLanguage({
      id: preset('foo'),
      label: 'foo',
      hint: 'h',
      examples: [],
      createdAt: 1,
    });
    const spy = vi.spyOn(chrome.storage.local, 'get');
    // Two back-to-back reads should hit storage exactly once.
    const a = await ensureCustomLanguages();
    const b = await ensureCustomLanguages();
    expect(a).toBe(b);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('invalidates the cache when another realm writes the customLanguages key', async () => {
    installCustomLanguagesInvalidator();
    await upsertCustomLanguage({
      id: preset('foo'),
      label: 'foo',
      hint: 'h',
      examples: [],
      createdAt: 1,
    });
    const first = await ensureCustomLanguages();
    expect(first).toHaveLength(1);

    // The write itself must fire the invalidation — no hand-fired event here.
    await upsertCustomLanguage({
      id: preset('bar'),
      label: 'bar',
      hint: 'h',
      examples: [],
      createdAt: 2,
    });

    const spy = vi.spyOn(chrome.storage.local, 'get');
    const second = await ensureCustomLanguages();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(second).toHaveLength(2);
    spy.mockRestore();
  });

  it('drops stale in-flight read when invalidator fires mid-await', async () => {
    installCustomLanguagesInvalidator();
    // Seed initial value
    await upsertCustomLanguage({
      id: preset('foo'),
      label: 'foo',
      hint: 'h',
      examples: [],
      createdAt: 1,
    });

    resetCustomLanguagesCache();

    // Hold the first read open, or it can resolve and re-read before 'bar' is written.
    const local = chrome.storage.local as unknown as {
      get: (key: string) => Promise<Record<string, unknown>>;
    };
    const realGet = local.get.bind(local);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    local.get = (key) => {
      local.get = realGet;
      return gate.then(() => realGet(key));
    };

    const inflight = ensureCustomLanguages();
    // The reader loads its storage chunk lazily; drain that first so the gate holds the read, not the import.
    await new Promise((r) => setTimeout(r, 0));

    // Invalidator fires mid-await — stale read must not write back.
    chromeMock.storage.local._fire({
      [STORAGE_KEYS.customLanguages]: { oldValue: [], newValue: [] },
    });

    // Add a new entry after the invalidation so the re-read sees a different list.
    await upsertCustomLanguage({
      id: preset('bar'),
      label: 'bar',
      hint: 'h',
      examples: [],
      createdAt: 2,
    });
    release();

    const list = await inflight;
    expect(list).toHaveLength(2);
  });

  it('ignores a real write to an unrelated key', async () => {
    installCustomLanguagesInvalidator();
    await upsertCustomLanguage({
      id: preset('foo'),
      label: 'foo',
      hint: 'h',
      examples: [],
      createdAt: 1,
    });
    const first = await ensureCustomLanguages();

    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: { theme: 'dark' } });

    const spy = vi.spyOn(chrome.storage.local, 'get');
    // Same array identity — the cache was never dropped, so no storage read.
    expect(await ensureCustomLanguages()).toBe(first);
    expect(spy).toHaveBeenCalledTimes(0);
    spy.mockRestore();
  });
});
