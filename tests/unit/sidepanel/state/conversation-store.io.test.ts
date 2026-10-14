import { describe, it, expect } from 'vitest';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import { userTurn } from '@tests/_helpers/turns';

describe('loadThreadResult / saveThread', () => {
  it('returns [] for an origin never saved', async () => {
    expect((await loadThreadResult('https://fresh.com')).turns).toEqual([]);
  });

  it('round-trips a thread for an origin', async () => {
    const turns = [userTurn('a', 'hola'), userTurn('b', 'mundo')];
    await saveThread('https://site.com', turns);
    expect((await loadThreadResult('https://site.com')).turns).toEqual(turns);
  });

  it('keeps origins isolated', async () => {
    await saveThread('https://a.com', [userTurn('a', 'A')]);
    await saveThread('https://b.com', [userTurn('b', 'B')]);
    expect((await loadThreadResult('https://a.com')).turns).toEqual([userTurn('a', 'A')]);
    expect((await loadThreadResult('https://b.com')).turns).toEqual([userTurn('b', 'B')]);
  });

  it('keys the thread blob by the origin itself', async () => {
    await saveThread('https://keyed.com', [userTurn('a', 'A')]);
    const key = 'ega:conv:t:https://keyed.com';
    const stored = (await chrome.storage.local.get(key))[key] as { origin: string };
    expect(stored.origin).toBe('https://keyed.com');
  });

  it('a corrupt stored thread loads as []', async () => {
    const turns = [userTurn('a', 'A')];
    await saveThread('https://corrupt.com', turns);
    const key = 'ega:conv:t:https://corrupt.com';
    await chrome.storage.local.set({ [key]: { version: 1, turns: 'not-an-array' } });
    expect((await loadThreadResult('https://corrupt.com')).turns).toEqual([]);
  });

  it('a wrong-version thread loads as []', async () => {
    await saveThread('https://v.com', [userTurn('a', 'A')]);
    const key = 'ega:conv:t:https://v.com';
    await chrome.storage.local.set({
      [key]: { version: 999, origin: 'https://v.com', turns: [], updatedAt: 1 },
    });
    expect((await loadThreadResult('https://v.com')).turns).toEqual([]);
  });

  it('upserts an index entry for the saved origin', async () => {
    await saveThread('https://idx.com', [userTurn('a', 'A')]);
    const r = await chrome.storage.local.get('ega:conv:index');
    const idx = r['ega:conv:index'] as {
      version: number;
      threads: { origin: string; updatedAt: number }[];
    };
    const entry = idx.threads.find((t) => t.origin === 'https://idx.com');
    expect(entry).toBeDefined();
    expect(typeof entry?.updatedAt).toBe('number');
  });

  it('re-saving the same origin does not duplicate its index entry', async () => {
    await saveThread('https://dup.com', [userTurn('a', 'A')]);
    await saveThread('https://dup.com', [userTurn('b', 'B')]);
    const r = await chrome.storage.local.get('ega:conv:index');
    const idx = r['ega:conv:index'] as { threads: { origin: string }[] };
    expect(idx.threads.filter((t) => t.origin === 'https://dup.com')).toHaveLength(1);
  });

  it('a turn with an unknown status becomes error WITH a synthesized error object', async () => {
    const key = 'ega:conv:t:https://badstatus.com';
    await chrome.storage.local.set({
      [key]: {
        version: 1,
        origin: 'https://badstatus.com',
        updatedAt: Date.now(),
        turns: [
          {
            id: 'u1',
            role: 'user',
            kind: 'translate',
            status: 'idle',
            content: 'good',
            createdAt: 1,
          },
          {
            id: 'a1',
            role: 'assistant',
            kind: 'translate',
            status: 'weird',
            content: 'partial',
            createdAt: 1,
          },
        ],
      },
    });
    const loaded = (await loadThreadResult('https://badstatus.com')).turns;
    expect(loaded).toHaveLength(2);
    const coerced = loaded.find((t) => t.id === 'a1');
    expect(coerced?.status).toBe('error');
    // The error object must exist so the renderer's error banner is not undefined.
    expect(coerced?.error).toBeDefined();
    expect(typeof coerced?.error?.code).toBe('string');
    expect(typeof coerced?.error?.message).toBe('string');
  });
});
