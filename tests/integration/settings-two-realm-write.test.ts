import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chromeMock } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import type { Settings } from '@/shared/types';
import type * as StorageModule from '@/shared/storage';

// Chrome hands every extension page and the SW the same navigator.locks manager; jsdom has none, so the harness below is it.

type Realm = typeof StorageModule;

async function loadRealm(): Promise<Realm> {
  const { vi } = await import('vitest');
  vi.resetModules();
  return import('@/shared/storage');
}

function installSharedLockManager(): () => void {
  const tails = new Map<string, Promise<unknown>>();
  const request = (name: string, fn: () => Promise<unknown>): Promise<unknown> => {
    const prev = tails.get(name) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    tails.set(
      name,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  };
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
  return () => {
    Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'locks');
  };
}

/** Holds the first `chrome.storage.local.get` open, so its caller ends up with a snapshot taken before the other write. */
function parkFirstRead(): { release: () => void; restore: () => void } {
  const original = chromeMock.storage.local.get;
  let parked = false;
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  chromeMock.storage.local.get = (async (keys?: string | string[] | null) => {
    const out = await original(keys as string);
    if (!parked) {
      parked = true;
      await gate;
    }
    return out;
  }) as typeof original;
  return {
    release,
    restore: () => {
      chromeMock.storage.local.get = original;
    },
  };
}

async function readStored(): Promise<Record<string, unknown>> {
  const raw = await chromeMock.storage.local.get(STORAGE_KEYS.settings);
  return (raw[STORAGE_KEYS.settings] ?? {}) as Record<string, unknown>;
}

describe('two realms writing settings at once', () => {
  let uninstallLocks: () => void;

  beforeEach(() => {
    uninstallLocks = installSharedLockManager();
  });

  afterEach(() => {
    uninstallLocks();
  });

  it('keeps a realm-B write that lands while realm A holds a stale snapshot', async () => {
    const realmA = await loadRealm();
    const realmB = await loadRealm();
    await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: { theme: 'system' } });

    const gate = parkFirstRead();
    try {
      // A reads (parked), B writes the API key, A then writes its own field.
      const a = realmA.updateSettings({ theme: 'dark' } as Partial<Settings>);
      const b = realmB.updateSettings({ anthropicApiKey: 'sk-ant-secret' } as Partial<Settings>);
      await new Promise((r) => setTimeout(r, 0));
      gate.release();
      await Promise.all([a, b]);
    } finally {
      gate.restore();
    }

    const stored = await readStored();
    expect(stored['anthropicApiKey']).toBe('sk-ant-secret');
    expect(stored['theme']).toBe('dark');
  });

  it('keeps a realm-B write when realm A goes through a replace* bypass', async () => {
    const realmA = await loadRealm();
    const realmB = await loadRealm();
    await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: { theme: 'system' } });

    const gate = parkFirstRead();
    try {
      const a = realmA.replaceSitePrefs({ 'https://example.com': { disabled: true } });
      const b = realmB.updateSettings({ openaiApiKey: 'sk-openai-secret' } as Partial<Settings>);
      await new Promise((r) => setTimeout(r, 0));
      gate.release();
      await Promise.all([a, b]);
    } finally {
      gate.restore();
    }

    const stored = await readStored();
    expect(stored['openaiApiKey']).toBe('sk-openai-secret');
    expect((stored['sitePrefs'] as Record<string, unknown>)['https://example.com']).toEqual({
      disabled: true,
    });
  });

  it('keeps a realm-B custom language added while realm A holds a stale list', async () => {
    const realmA = await loadRealm();
    const realmB = await loadRealm();

    const gate = parkFirstRead();
    try {
      const a = realmA.upsertCustomLanguage({
        id: 'lang-a',
        label: 'A',
        hint: 'a',
        examples: [],
        createdAt: 1,
      } as never);
      const b = realmB.upsertCustomLanguage({
        id: 'lang-b',
        label: 'B',
        hint: 'b',
        examples: [],
        createdAt: 2,
      } as never);
      await new Promise((r) => setTimeout(r, 0));
      gate.release();
      await Promise.all([a, b]);
    } finally {
      gate.restore();
    }

    const raw = await chromeMock.storage.local.get(STORAGE_KEYS.customLanguages);
    const list = (raw[STORAGE_KEYS.customLanguages] ?? []) as { id: string }[];
    expect(list.map((l) => l.id).sort()).toEqual(['lang-a', 'lang-b']);
  });

  it('drops a stored field neither realm declares — strip-on-read, not a race', async () => {
    const realmA = await loadRealm();
    await chromeMock.storage.local.set({
      [STORAGE_KEYS.settings]: { theme: 'system', fromANewerBuild: 'keep-me' },
    });

    await realmA.updateSettings({ theme: 'dark' } as Partial<Settings>);

    const stored = await readStored();
    expect(stored['theme']).toBe('dark');
    // A forward-compatible field needs a schema entry; no lock can preserve it.
    expect(stored['fromANewerBuild']).toBeUndefined();
  });
});
