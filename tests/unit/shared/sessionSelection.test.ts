import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { putSelection, getFreshSelection } from '@/shared/sessionSelection';

const ORIGIN = 'https://example.com';

interface MockStore {
  store: Record<string, unknown>;
}

function mockSessionStorage(): MockStore {
  const store: Record<string, unknown> = {};
  (globalThis as unknown as { chrome: Record<string, unknown> }).chrome = {
    storage: {
      session: {
        get: (key: string): Promise<Record<string, unknown>> =>
          Promise.resolve(key in store ? { [key]: store[key] } : {}),
        set: (items: Record<string, unknown>): Promise<void> => {
          Object.assign(store, items);
          return Promise.resolve();
        },
      },
    },
  };
  return { store };
}

describe('sessionSelection', () => {
  beforeEach(() => {
    mockSessionStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves a selection within TTL', async () => {
    await putSelection('hello', ORIGIN, 1);
    expect(await getFreshSelection(ORIGIN)).toBe('hello');
  });

  it('returns null when nothing stored', async () => {
    expect(await getFreshSelection(ORIGIN)).toBeNull();
  });

  it('returns null when the stored selection is stale (>60s old)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-19T00:00:00Z'));
    await putSelection('stale', ORIGIN, 1);
    vi.advanceTimersByTime(61_000);
    expect(await getFreshSelection(ORIGIN)).toBeNull();
  });

  it('refuses to store empty strings (no-op)', async () => {
    await putSelection('', ORIGIN, 1);
    expect(await getFreshSelection(ORIGIN)).toBeNull();
  });

  it('is resilient when chrome.storage.session is missing', async () => {
    (globalThis as unknown as { chrome: Record<string, unknown> }).chrome = {};
    await expect(putSelection('hi', ORIGIN, null)).resolves.toBeUndefined();
    await expect(getFreshSelection(ORIGIN)).resolves.toBeNull();
  });

  it('latest write wins within TTL', async () => {
    await putSelection('first', ORIGIN, 1);
    await putSelection('second', ORIGIN, 1);
    expect(await getFreshSelection(ORIGIN)).toBe('second');
  });

  it('caps the stored text at MAX_SELECTION_CHARS', async () => {
    const { MAX_SELECTION_CHARS } = await import('@/shared/constants');
    await putSelection('x'.repeat(MAX_SELECTION_CHARS + 5000), ORIGIN, 1);
    const stored = await getFreshSelection(ORIGIN);
    expect(stored?.length).toBe(MAX_SELECTION_CHARS);
  });
});

describe('sessionSelection is origin-scoped', () => {
  beforeEach(() => {
    mockSessionStorage();
  });

  it('does not hand another origin its selection', async () => {
    await putSelection('secret note', 'https://bank.example', null);

    expect(await getFreshSelection('https://news.example')).toBeNull();
  });

  it('returns the selection to the origin that wrote it', async () => {
    await putSelection('secret note', 'https://bank.example', null);

    expect(await getFreshSelection('https://bank.example')).toBe('secret note');
  });

  it('returns null when the caller cannot name an origin', async () => {
    await putSelection('secret note', 'https://bank.example', null);

    expect(await getFreshSelection(null)).toBeNull();
  });

  it('treats a port as part of the origin', async () => {
    await putSelection('dev note', 'http://localhost:3000', null);

    expect(await getFreshSelection('http://localhost:4000')).toBeNull();
    expect(await getFreshSelection('http://localhost:3000')).toBe('dev note');
  });
});
