// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import { saveThread } from '@/sidepanel/state/conversation-store';
import { asLangIdUnsafe } from '@/shared/brands';
import { toastStore } from '@/shared/components/toastStore';
import UserTurn from '@/sidepanel/conversation/UserTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';
import { startCalls } from '@tests/_helpers/messages';

const sendMessage = chrome.runtime.sendMessage as Mock;

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  sendMessage.mockClear();
  sendMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true });
  vi.restoreAllMocks();
});

describe('Regenerate on a byte-shrunk turn keeps the answer it re-runs', () => {
  it('appends a variant instead of replacing the finished reply', async () => {
    const origin = 'https://shrunk.test';
    await saveThread(
      origin,
      [
        {
          id: 'u1',
          role: 'user',
          kind: 'translate',
          status: 'idle',
          content: 'hola',
          createdAt: 1,
          dispatch: {
            sourceLang: asLangIdUnsafe('es'),
            targetLang: asLangIdUnsafe('en'),
            stream: false,
          },
        },
        {
          id: 'a1',
          role: 'assistant',
          kind: 'translate',
          status: 'done',
          content: 'y'.repeat(400 * 1024),
          attachedToTurnId: 'u1',
          variants: [{ id: 'a1:v1', status: 'done', content: 'y'.repeat(400 * 1024) }],
          activeVariantIdx: 0,
          createdAt: 2,
        },
      ],
      { knownIds: new Set(['u1', 'a1']), deletedAt: new Map(), revivedAt: new Map() },
    );
    const c = createConversation();
    await c.openConversation(origin);
    const before = c.turns.find((t) => t.role === 'assistant');
    // The byte cap stripped variants on save; the loader rebuilds v1 so Regenerate appends beside it.
    expect(before?.variants).toHaveLength(1);
    const keptBody = before?.content ?? '';
    expect(keptBody.length).toBeGreaterThan(0);

    expect(await c.regenerateVariant('a1')).toBe(true);
    const after = c.turns.find((t) => t.id === 'a1');
    // The turn survives, the old answer is variant 1, and the new one is beside it.
    expect(after).toBeDefined();
    expect(after?.variants?.[0]?.content).toBe(keptBody);
    expect(after?.variants).toHaveLength(2);
    c.cancel();
  });
});

describe('a swap only replays a language this build knows', () => {
  it('refuses a detected string that is not a code', async () => {
    const c = createConversation();
    const assistantId = await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const requestId = startCalls()[0]?.['requestId'] as string;
    c.applyChunk({ type: 'done', requestId, detectedLang: 'Middle Elvish (High)' } as never);
    expect(c.swapPair(assistantId)).toBeNull();
  });

  it('accepts a real ISO code the model reported', async () => {
    const c = createConversation();
    const assistantId = await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    const requestId = startCalls()[0]?.['requestId'] as string;
    c.applyChunk({ type: 'done', requestId, detectedLang: 'es' } as never);
    expect(c.swapPair(assistantId)).not.toBeNull();
  });
});

describe('the unreadable-thread warning fires once per site', () => {
  it('does not repeat on a second visit to the same origin', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    // Listed in the index, unreadable on disk: the tab's site opens it, the list refuses it.
    await saveThread('https://broken.test', [
      { id: 'b1', role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content: 'x' },
    ]);
    await chrome.storage.local.set({ 'ega:conv:t:https://broken.test': { nonsense: true } });
    const c = createConversation();
    await c.followSite('https://broken.test');
    await c.followSite('https://other.test');
    await c.followSite('https://broken.test');
    const warnings = push.mock.calls.filter((call) => /could not be read/.test(call[0].message));
    expect(warnings).toHaveLength(1);
    // The claim has to match what the store does on the next write.
    expect(warnings[0]?.[0]?.message).toMatch(/replaces it/);
  });
});

describe('a repeat failure means failures in a row', () => {
  it('clears the count when an answer finally lands', async () => {
    const c = createConversation();
    const assistantId = await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: asLangIdUnsafe('en'),
      stream: true,
    });
    c.applyChunk({
      type: 'error',
      requestId: startCalls()[0]?.['requestId'] as string,
      code: 'NETWORK',
      message: 'boom',
    });
    await c.retry(assistantId);
    const retried = c.turns.find((t) => t.role === 'assistant');
    expect(retried?.retries).toBe(1);

    c.applyChunk({ type: 'done', requestId: startCalls()[1]?.['requestId'] as string });
    expect(c.turns.find((t) => t.role === 'assistant')?.retries).toBeUndefined();
  });
});

describe('the roving tab stop never lands on a disabled control', () => {
  it('drops the pencil from the user-turn cycle while a reply streams', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'u1',
      role: 'user',
      kind: 'translate',
      status: 'idle',
      content: 'hola',
    };
    const { container } = render(UserTurn, { props: { turn, inflight: true } });
    const toolbar = container.querySelector('[role="toolbar"]');
    const stop = toolbar?.querySelector<HTMLButtonElement>('button[tabindex="0"]');
    expect(stop).not.toBeNull();
    expect(stop?.disabled).toBe(false);
  });

  it('moves the stop to a live control when the reply settles', async () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'u1',
      role: 'user',
      kind: 'translate',
      status: 'idle',
      content: 'hola',
    };
    const { container, rerender } = render(UserTurn, { props: { turn, inflight: false } });
    const toolbar = container.querySelector('[role="toolbar"]');
    if (!toolbar) throw new Error('toolbar not found');
    await fireEvent.keyDown(toolbar, { key: 'End' });
    await rerender({ turn, inflight: true });
    const stop = toolbar.querySelector<HTMLButtonElement>('button[tabindex="0"]');
    expect(stop?.disabled).toBe(false);
  });
});

describe('a draft image the store refuses leaves nothing behind', () => {
  it('clears the previous row rather than restoring a stale image', async () => {
    const { writeComposerDraftImage, readComposerDraftImage } =
      await import('@/sidepanel/state/composer-draft');
    const small = 'data:image/png;base64,iVBORw0KGgo=';
    expect(await writeComposerDraftImage(small)).toBe(true);
    const huge = `data:image/png;base64,${'A'.repeat(300 * 1024)}`;
    expect(await writeComposerDraftImage(huge)).toBe(false);
    expect(await readComposerDraftImage()).toBeNull();
  });
});

describe('the orphan-draft sweep is runnable, and only removes dead rows', () => {
  it('keeps a live window row and drops a closed one', async () => {
    const { pruneOrphanDrafts } = await import('@/sidepanel/state/composer-draft');
    // afterEach's restoreAllMocks strips the shared chrome mock's implementations.
    (chrome.windows.getAll as Mock).mockResolvedValue([{ id: 1 }]);
    await chrome.storage.session.set({
      'ega.sidepanelDraft:1': { text: 'live' },
      'ega.sidepanelDraft:99': { text: 'closed window' },
      'ega.sidepanelDraft': { text: 'unsuffixed' },
    });
    await pruneOrphanDrafts();
    const after = (await chrome.storage.session.get(null)) as Record<string, unknown>;
    expect(after['ega.sidepanelDraft:1']).toBeDefined();
    expect(after['ega.sidepanelDraft']).toBeDefined();
    expect(after['ega.sidepanelDraft:99']).toBeUndefined();
  });
});

describe('the empty-answer copy names a control that exists', () => {
  it('points at Regenerate, the only re-run left on a done turn', () => {
    const src = readFileSync('src/sidepanel/conversation/AssistantTurn.svelte', 'utf8');
    expect(src).toMatch(/No answer came back\. Try Regenerate\./);
    expect(src).not.toMatch(/No answer came back\. Try Retry/);
  });
});
