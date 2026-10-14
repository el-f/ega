// Several conversations per site: ids, facts, the "current" pick, and the store invariants an older build relies on.
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import {
  currentConversation,
  deleteSavedConversation,
  entryFacts,
  flushPendingDeletes,
  forgetPendingDeletes,
  groupConversations,
  markConversationOpened,
  newConversationId,
  readIndex,
  scheduleConversationDelete,
  siteOf,
  threadKey,
  type IndexEntry,
} from '@/shared/saved-conversations';
import { MAX_THREADS, saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';

function userTurn(id: string, content: string): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content };
}

const site = fc.oneof(
  fc.constant('general'),
  fc
    .tuple(
      fc.constantFrom('http', 'https'),
      fc.domain(),
      fc.option(fc.integer({ min: 1, max: 65535 })),
    )
    .map(([s, d, p]) => `${s}://${d}${p === null ? '' : `:${p}`}`),
);

describe('newConversationId (C6)', () => {
  it('always belongs to the site it was made for', () => {
    fc.assert(
      fc.property(site, fc.integer({ min: 0 }), (s, now) => {
        expect(siteOf(newConversationId(s, now))).toBe(s);
      }),
    );
  });

  it('an id saved before this change is its own site', () => {
    expect(siteOf('https://example.com')).toBe('https://example.com');
  });
});

describe('entryFacts (C7)', () => {
  it('title is the trimmed first line, one line, at most 80 code points', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 200 }), fc.string(), (text, rest) => {
        const facts = entryFacts([{ role: 'user', content: `${text}\n${rest}`, createdAt: 3 }]);
        const line = text.trim();
        if (line === '') return;
        expect(facts.title).not.toContain('\n');
        expect(Array.from(facts.title ?? '').length).toBeLessThanOrEqual(80);
        if (Array.from(line).length <= 80) expect(facts.title).toBe(line);
      }),
    );
  });

  it('an image-only first message is flagged, and counts every turn', () => {
    expect(
      entryFacts([
        {
          role: 'user',
          content: '[image]',
          imageDataUrl: 'data:image/png;base64,AA',
          createdAt: 9,
        },
        { role: 'assistant', content: 'hi' },
      ]),
    ).toEqual({ imageFirst: true, messages: 2, createdAt: 9 });
  });

  it('a thread with no user message has no title', () => {
    expect(entryFacts([])).toEqual({ messages: 0 });
  });
});

describe('currentConversation and groupConversations', () => {
  const rows: IndexEntry[] = [
    { origin: 'https://a.test', updatedAt: 10, bytes: 50 },
    { origin: 'https://a.test#x1', updatedAt: 20, bytes: 50 },
    { origin: 'https://a.test#x2', updatedAt: 5, bytes: 50, openedAt: 30 },
    { origin: 'https://a.test#gone', updatedAt: 99, bytes: 2 },
    { origin: 'https://b.test', updatedAt: 40, bytes: 50 },
  ];

  it('picks the site row touched last, by save or by open, never an emptied one', () => {
    expect(currentConversation(rows, 'https://a.test')).toBe('https://a.test#x2');
    expect(currentConversation(rows, 'https://a.test', new Set(['https://a.test#x2']))).toBe(
      'https://a.test#x1',
    );
    expect(currentConversation(rows, 'https://none.test')).toBeNull();
  });

  it('lists this site first and the rest after, newest first, without emptied rows', () => {
    const g = groupConversations(rows, 'https://a.test');
    expect(g.thisSite.map((r) => r.origin)).toEqual([
      'https://a.test#x1',
      'https://a.test',
      'https://a.test#x2',
    ]);
    expect(g.otherSites.map((r) => r.origin)).toEqual(['https://b.test']);
  });
});

describe('store invariants under saves, deletes and opens (C5)', () => {
  type Op = { op: 'save' | 'delete' | 'open'; id: number; site: number };
  const ops = fc.array(
    fc.record({
      op: fc.constantFrom('save', 'save', 'save', 'delete', 'open'),
      id: fc.integer({ min: 0, max: 79 }),
      site: fc.integer({ min: 0, max: 4 }),
    }) as fc.Arbitrary<Op>,
    { minLength: 1, maxLength: 120 },
  );

  it('at most 50 rows, emptied rows go first, every live row has its blob, every blob is v1', async () => {
    await fc.assert(
      fc.asyncProperty(ops, async (seq) => {
        resetChromeMock();
        let liveEvictedWhileEmptyExisted = false;
        for (const { op, id, site: s } of seq) {
          const conv = `https://s${s}.test#c${id}`;
          if (op === 'save') {
            const before = (await readIndex()).threads;
            await saveThread(conv, [userTurn(`t${id}`, `message ${id}`)]);
            const after = new Set((await readIndex()).threads.map((t) => t.origin));
            const gone = before.filter((t) => !after.has(t.origin));
            const emptyLeft = (await readIndex()).threads.some((t) => t.bytes <= 2);
            if (gone.some((t) => t.bytes > 2) && emptyLeft) liveEvictedWhileEmptyExisted = true;
          } else if (op === 'delete') {
            await deleteSavedConversation(conv);
          } else {
            await markConversationOpened(conv);
          }
        }
        const { threads } = await readIndex();
        expect(threads.length).toBeLessThanOrEqual(MAX_THREADS);
        expect(liveEvictedWhileEmptyExisted).toBe(false);
        for (const t of threads.filter((e) => e.bytes > 2)) {
          const blob = chromeMock.storage.local._raw.get(threadKey(t.origin)) as
            { origin: string; version: number } | undefined;
          expect(blob?.origin).toBe(t.origin);
        }
        for (const [k, v] of chromeMock.storage.local._raw) {
          if (k.startsWith('ega:conv:t:')) expect((v as { version: number }).version).toBe(1);
        }
      }),
      { numRuns: 25 },
    );
  });
});

describe('eviction (C5 example)', () => {
  it('drops an emptied row before the oldest real conversation', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      for (let i = 0; i < MAX_THREADS; i++) {
        vi.setSystemTime(1_000 + i);
        await saveThread(`https://s.test#c${i}`, [userTurn(`t${i}`, `m${i}`)]);
      }
      vi.setSystemTime(5_000);
      await deleteSavedConversation('https://s.test#c49');
      vi.setSystemTime(6_000);
      await saveThread('https://s.test#new', [userTurn('n', 'new')]);
    } finally {
      vi.useRealTimers();
    }
    const ids = (await readIndex()).threads.map((t) => t.origin);
    expect(ids).toContain('https://s.test#c0');
    expect(ids).not.toContain('https://s.test#c49');
  });
});

// C8: closing the panel inside the Undo window is why the worker finishes a delete; the flush sends it at once.
describe('flushPendingDeletes', () => {
  it('lets a paused Undo toast own the delete deadline, while page close still flushes it', () => {
    vi.useFakeTimers();
    try {
      const send = chromeMock.runtime.sendMessage;
      send.mockClear();
      send.mockResolvedValue({ ok: true });
      const handle = scheduleConversationDelete(['https://held.test'], { ms: null });
      vi.advanceTimersByTime(30_000);
      expect(send).not.toHaveBeenCalled();
      handle.commit();
      flushPendingDeletes();
      expect(send).toHaveBeenCalledExactlyOnceWith({
        kind: 'conversations:delete',
        ids: ['https://held.test'],
      });
    } finally {
      forgetPendingDeletes();
      vi.useRealTimers();
    }
  });

  it('sends a waiting delete at once, and only once', () => {
    vi.useFakeTimers();
    try {
      const send = chromeMock.runtime.sendMessage;
      send.mockClear();
      send.mockResolvedValue({ ok: true });
      const deletes = (): unknown[] =>
        send.mock.calls
          .map((c) => c[0] as { kind?: string })
          .filter((m) => m.kind === 'conversations:delete');
      scheduleConversationDelete(['https://a.test']);
      expect(deletes()).toHaveLength(0);

      flushPendingDeletes();
      expect(deletes()).toEqual([{ kind: 'conversations:delete', ids: ['https://a.test'] }]);
      // The Undo window's own timer was cleared with it.
      vi.advanceTimersByTime(10_000);
      expect(deletes()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      forgetPendingDeletes();
    }
  });
});
