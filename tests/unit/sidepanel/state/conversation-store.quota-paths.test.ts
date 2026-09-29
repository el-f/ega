import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INDEX_KEY,
  isQuotaError,
  loadThreadResult,
  saveThread,
  threadKey,
} from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';
import { userTurn } from '@tests/_helpers/turns';

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

/** Seeds the index and a blob per origin, so eviction has real rows to order. */
async function seedThreads(rows: Array<{ origin: string; updatedAt: number }>): Promise<void> {
  await chrome.storage.local.set({
    [INDEX_KEY]: {
      version: 1,
      threads: rows.map((r) => ({ origin: r.origin, updatedAt: r.updatedAt, bytes: 32 })),
    },
  });
  for (const r of rows) {
    await chrome.storage.local.set({
      [threadKey(r.origin)]: {
        version: 1,
        origin: r.origin,
        updatedAt: r.updatedAt,
        turns: [userTurn(`t-${r.origin}`)],
      },
    });
  }
}

async function indexOrigins(): Promise<string[]> {
  const raw = (await chrome.storage.local.get(INDEX_KEY))[INDEX_KEY] as
    { threads?: Array<{ origin: string }> } | undefined;
  return (raw?.threads ?? []).map((t) => t.origin);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isQuotaError', () => {
  it('rejects a non-Error, whatever it says', () => {
    expect(isQuotaError('QUOTA_BYTES quota exceeded')).toBe(false);
    expect(isQuotaError({ message: 'QUOTA_BYTES' })).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
  });

  it('matches QUOTA_BYTES exactly and quota in any case', () => {
    expect(isQuotaError(new Error('QUOTA_BYTES quota exceeded'))).toBe(true);
    expect(isQuotaError(new Error('Quota exceeded'))).toBe(true);
    expect(isQuotaError(new Error('QUOTA'))).toBe(true);
  });

  it('rejects an unrelated Error', () => {
    expect(isQuotaError(new Error('network down'))).toBe(false);
    // `quota` is matched lowercased; nothing else in this message should reach it.
    expect(isQuotaError(new Error('quo ta'))).toBe(false);
  });
});

describe('a storage read that throws', () => {
  it('reads as an empty thread the panel is told it cannot read', async () => {
    vi.spyOn(chrome.storage.local, 'get').mockRejectedValue(new Error('storage is gone'));

    const result = await loadThreadResult('https://a.com');

    expect(result.turns).toEqual([]);
    expect(result.unreadable).toBe(true);
  });
});

describe('quota eviction order', () => {
  it('takes the least recently updated other thread, not the most recent', async () => {
    await seedThreads([
      // Oldest-first is what commitIndex stores, so this is the order eviction really reads.
      { origin: 'https://oldest.com', updatedAt: 1000 },
      { origin: 'https://middle.com', updatedAt: 2000 },
      { origin: 'https://newest.com', updatedAt: 3000 },
    ]);

    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    let armed = true;
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    vi.spyOn(chrome.storage.local, 'set').mockImplementation((items) => {
      const record = items as Record<string, unknown>;
      if (armed && Object.keys(record).some((k) => k.startsWith('ega:conv:t:'))) {
        armed = false;
        return Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
      }
      return originalSet(record);
    });

    const result = await saveThread('https://writer.com', [userTurn('w')]);

    expect(result.evictedOrigin).toBe('https://oldest.com');
    expect(await indexOrigins()).not.toContain('https://oldest.com');
    expect(await chrome.storage.local.get(threadKey('https://oldest.com'))).toEqual({});
  });
});

describe('the write that retries without images', () => {
  it('evicts another thread when the leaner write is refused too', async () => {
    await seedThreads([{ origin: 'https://victim.com', updatedAt: 1000 }]);

    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    let threadWrites = 0;
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    vi.spyOn(chrome.storage.local, 'set').mockImplementation((items) => {
      const record = items as Record<string, unknown>;
      if (Object.keys(record).some((k) => k.startsWith('ega:conv:t:'))) {
        threadWrites++;
        // Refuse the full write and the image-shed retry; let the post-eviction one land.
        if (threadWrites <= 2) return Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
      }
      return originalSet(record);
    });

    const result = await saveThread('https://writer.com', [imageTurn('i')]);

    expect(threadWrites).toBe(3);
    expect(result.shedImages).toBeUndefined();
    expect(result.evictedOrigin).toBe('https://victim.com');
  });

  it('reports the shed instead of evicting when the leaner write lands', async () => {
    await seedThreads([{ origin: 'https://victim.com', updatedAt: 1000 }]);

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

    const result = await saveThread('https://writer.com', [imageTurn('i')]);

    expect(result.shedImages).toBe(true);
    expect(result.evictedOrigin).toBeUndefined();
    expect(await indexOrigins()).toContain('https://victim.com');
    const stored = (await chrome.storage.local.get(threadKey('https://writer.com')))[
      threadKey('https://writer.com')
    ] as { turns: Turn[] };
    // stripImage keeps the turn's own text; the shed is the payload going away.
    expect(stored.turns[0]?.imageDataUrl).toBeUndefined();
    expect(stored.turns[0]?.content).toBe('[image]');
  });

  it('rethrows when the leaner write fails for a reason that is not quota', async () => {
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    let threadWrites = 0;
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    vi.spyOn(chrome.storage.local, 'set').mockImplementation((items) => {
      const record = items as Record<string, unknown>;
      if (Object.keys(record).some((k) => k.startsWith('ega:conv:t:'))) {
        threadWrites++;
        if (threadWrites === 1) return Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
        if (threadWrites === 2) return Promise.reject(new Error('storage is gone'));
      }
      return originalSet(record);
    });

    await expect(saveThread('https://writer.com', [imageTurn('i')])).rejects.toThrow(
      'storage is gone',
    );
  });
});
