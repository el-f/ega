import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadThreadResult, saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';
import { userTurn } from '@tests/_helpers/turns';

const INDEX_KEY = 'ega:conv:index';

async function indexOrigins(): Promise<string[]> {
  const raw = (await chrome.storage.local.get(INDEX_KEY))[INDEX_KEY] as
    { threads?: Array<{ origin: string }> } | undefined;
  return (raw?.threads ?? []).map((t) => t.origin);
}

/** Reject the first thread-blob write with a quota error; let everything else through. */
function failFirstThreadWrite(): void {
  const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
  let armed = true;
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  vi.spyOn(chrome.storage.local, 'set').mockImplementation((items) => {
    const keys = Object.keys(items as Record<string, unknown>);
    if (armed && keys.some((k) => k.startsWith('ega:conv:t:'))) {
      armed = false;
      return Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
    }
    return originalSet(items as Record<string, unknown>);
  });
}

/** Reject every thread-blob write that still carries an image payload. */
function failThreadWritesCarryingImages(): void {
  const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  vi.spyOn(chrome.storage.local, 'set').mockImplementation((items) => {
    const record = items as Record<string, unknown>;
    const isThread = Object.keys(record).some((k) => k.startsWith('ega:conv:t:'));
    if (isThread && JSON.stringify(record).includes('data:image')) {
      return Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
    }
    return originalSet(record);
  });
}

function imageTurn(id: string): Turn {
  return {
    id,
    role: 'user',
    kind: 'image-translate',
    status: 'idle',
    createdAt: 1,
    content: '[image]',
    imageDataUrl: `data:image/png;base64,${'A'.repeat(2048)}`,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the quota retry never evicts the thread it is writing', () => {
  it('keeps the saved origin in the index when it is the only thread', async () => {
    const origin = 'https://only.test';
    await saveThread(origin, [userTurn('a', 'first')]);
    failFirstThreadWrite();

    await saveThread(origin, [userTurn('a', 'first'), userTurn('b', 'second')]);

    expect(await indexOrigins()).toContain(origin);
    expect((await loadThreadResult(origin)).turns).toHaveLength(2);
  });

  it('evicts another origin rather than itself, and names the one it dropped', async () => {
    const older = 'https://older.test';
    const current = 'https://current.test';
    await saveThread(older, [userTurn('o', 'old')]);
    await saveThread(current, [userTurn('c', 'new')]);
    failFirstThreadWrite();

    const result = await saveThread(current, [userTurn('c', 'new'), userTurn('c2', 'newer')]);

    expect(result.evicted?.id).toBe(older);
    const origins = await indexOrigins();
    expect(origins).toContain(current);
    expect(origins).not.toContain(older);
  });

  it('gives up its own image before another origin thread', async () => {
    const older = 'https://older.test';
    const current = 'https://current.test';
    await saveThread(older, [userTurn('o', 'old')]);
    failThreadWritesCarryingImages();

    const result = await saveThread(current, [imageTurn('pic'), userTurn('c', 'new')]);

    expect(result.evicted?.id).toBeUndefined();
    expect(await indexOrigins()).toContain(older);
    const loaded = (await loadThreadResult(current)).turns;
    expect(loaded).toHaveLength(2);
    expect(loaded.some((t) => t.imageDataUrl !== undefined)).toBe(false);
  });

  it('a save with room to spare reports no eviction', async () => {
    const result = await saveThread('https://calm.test', [userTurn('a', 'first')]);
    expect(result.evicted?.id).toBeUndefined();
  });
});
