// C9: only an extension page may finish a conversation delete, and only with a well-formed id list.
import { describe, it, expect } from 'vitest';
import { chromeMock } from '../../mocks/chrome';
import { handleConversationsDelete } from '@/background/conversations-delete';
import { INDEX_KEY, readIndex, threadKey } from '@/shared/saved-conversations';
import { saveThread } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';

function userTurn(id: string): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content: id };
}

async function seed(): Promise<void> {
  await saveThread('https://a.test', [userTurn('a1')]);
  await saveThread('https://a.test#x', [userTurn('a2')]);
  await saveThread('https://b.test', [userTurn('b1')]);
}

describe('conversations:delete', () => {
  it('refuses a content script and removes nothing', async () => {
    await seed();
    expect(await handleConversationsDelete(['https://a.test'], false)).toEqual({ ok: false });
    expect((await readIndex()).threads.every((t) => t.bytes > 2)).toBe(true);
  });

  it.each([[[]], [[1]], [['']], [Array.from({ length: 51 }, (_, i) => `x${i}`)], ['some'], [null]])(
    'refuses a malformed id list %#',
    async (ids) => {
      await seed();
      expect(await handleConversationsDelete(ids, true)).toEqual({ ok: false });
      expect((await readIndex()).threads.every((t) => t.bytes > 2)).toBe(true);
    },
  );

  it('deletes the named conversations and leaves the rest', async () => {
    await seed();
    expect(await handleConversationsDelete(['https://a.test#x'], true)).toEqual({ ok: true });
    const rows = new Map((await readIndex()).threads.map((t) => [t.origin, t.bytes]));
    expect(rows.get('https://a.test#x')).toBe(2);
    expect(rows.get('https://a.test')).toBeGreaterThan(2);
    expect(rows.get('https://b.test')).toBeGreaterThan(2);
  });

  it("'all' removes every thread key and the index", async () => {
    await seed();
    expect(await handleConversationsDelete('all', true)).toEqual({ ok: true });
    const keys = [...chromeMock.storage.local._raw.keys()];
    expect(keys.filter((k) => k.startsWith('ega:conv:t:') || k === INDEX_KEY)).toEqual([]);
    expect(keys).not.toContain(threadKey('https://a.test'));
  });
});
