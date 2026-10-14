import { beforeEach, describe, expect, it } from 'vitest';
import { resetChromeMock } from '../../mocks/chrome';
import {
  conversationOpenKey,
  queueConversationOpen,
  takeConversationOpen,
} from '@/shared/pending-conversation-open';

beforeEach(() => resetChromeMock());

describe('saved conversation open intent', () => {
  it('consumes each window choice once without touching another window', async () => {
    await queueConversationOpen('https://one.test#1', 1);
    await queueConversationOpen('https://two.test#2', 2);
    expect(await takeConversationOpen(undefined)).toBeNull();
    expect(await takeConversationOpen(1)).toBe('https://one.test#1');
    expect(await takeConversationOpen(1)).toBeNull();
    expect(await takeConversationOpen(2)).toBe('https://two.test#2');
  });

  it('does not lose a newer click while the previous choice is being consumed', async () => {
    await queueConversationOpen('old', 1);
    const [old] = await Promise.all([takeConversationOpen(1), queueConversationOpen('new', 1)]);
    expect(old).toBe('old');
    expect(await takeConversationOpen(1)).toBe('new');
  });

  it.each([
    { id: 'old', ts: Date.now() - 120_000 },
    { id: 'future', ts: Date.now() + 120_000 },
    { id: '', ts: Date.now() },
    { id: 'missing timestamp' },
    { id: 'too long'.repeat(1000), ts: Date.now() },
  ])('discards a stale or malformed choice: %j', async (entry) => {
    const key = conversationOpenKey(1);
    await chrome.storage.session.set({ [key]: entry });
    expect(await takeConversationOpen(1)).toBeNull();
    expect((await chrome.storage.session.get(key))[key]).toBeUndefined();
  });
});
