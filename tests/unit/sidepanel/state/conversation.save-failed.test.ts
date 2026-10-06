import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import {
  createConversation,
  type ConversationContainer,
} from '@/sidepanel/state/conversation.svelte';
import { asLangIdUnsafe } from '@/shared/brands';
import { toastStore } from '@/shared/components/toastStore';

const en = asLangIdUnsafe('en');

function seed(c: ConversationContainer): void {
  c.seedDeliveredTurn({
    kind: 'translate',
    sourceText: 'hola',
    response: 'hello',
    sourceLang: 'auto',
    targetLang: en,
    stream: false,
  });
}

function failEveryWrite(): void {
  vi.spyOn(chrome.storage.local, 'set').mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));
}

/** Reject the next thread-blob write with a quota error; let everything else through. */
function failNextThreadWrite(): void {
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
}

beforeEach(() => {
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a save that fails is visible', () => {
  it('flush reports the failure and clears it after the next good save', async () => {
    const c = createConversation();
    await c.openConversation('https://q.com');
    seed(c);
    failEveryWrite();

    await expect(c.flush()).rejects.toThrow(/quota/i);
    expect(c.saveFailed).toBe(true);

    vi.restoreAllMocks();
    await c.flush();
    expect(c.saveFailed).toBe(false);
  });

  it('the debounced save reports the failure instead of swallowing it', async () => {
    vi.useFakeTimers();
    const c = createConversation();
    await c.openConversation('https://d.com');
    failEveryWrite();
    seed(c);

    await vi.advanceTimersByTimeAsync(600);
    // Under load the rejected write can settle a few ticks later; a save still in flight after this test ends leaks its toast into the next one.
    await vi.waitFor(() => expect(c.saveFailed).toBe(true));
  });

  it('warns the user once, not on every later save', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const c = createConversation();
    await c.openConversation('https://t.com');
    seed(c);
    failEveryWrite();

    await expect(c.flush()).rejects.toThrow();
    await expect(c.flush()).rejects.toThrow();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]?.[0].message).toMatch(/storage is full/i);
  });

  it('names the site whose saved conversation was deleted to make room', async () => {
    const first = createConversation();
    await first.openConversation('https://old.com');
    seed(first);
    await first.flush();

    const c = createConversation();
    await c.openConversation('https://new.com');
    seed(c);
    await c.flush();

    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    failNextThreadWrite();
    await c.flush();

    expect(push.mock.calls.map((call) => call[0].message)).toContainEqual(
      expect.stringContaining('old.com'),
    );
  });

  it('a failed flush does not block the origin switch', async () => {
    const c = createConversation();
    await c.openConversation('https://one.com');
    seed(c);
    failEveryWrite();

    await expect(c.openConversation('https://two.com')).resolves.toBeUndefined();
    expect(c.turns).toEqual([]);
    expect(c.saveFailed).toBe(true);
  });

  it('says which site lost its unsaved messages when the panel follows a tab switch', async () => {
    const c = createConversation();
    await c.openConversation('https://one.com');
    seed(c);
    failEveryWrite();
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});

    await c.openConversation('https://two.com');

    const messages = push.mock.calls.map((call) => call[0].message);
    expect(messages).toContainEqual(expect.stringMatching(/were not kept/));
    expect(messages).toContainEqual(expect.stringContaining('one.com'));
  });

  it('stays quiet when the switch happened after a healthy save', async () => {
    const c = createConversation();
    await c.openConversation('https://ok.com');
    seed(c);
    await c.flush();
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});

    await c.openConversation('https://next.com');

    expect(push.mock.calls.map((call) => call[0].message)).not.toContainEqual(
      expect.stringMatching(/were not kept/),
    );
  });

  it('warns again on the next switch, naming the new site', async () => {
    const c = createConversation();
    await c.openConversation('https://one.com');
    seed(c);
    failEveryWrite();
    await c.openConversation('https://two.com');
    seed(c);
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});

    await c.openConversation('https://three.com');

    expect(push.mock.calls.map((call) => call[0].message)).toContainEqual(
      expect.stringContaining('two.com'),
    );
  });
});
