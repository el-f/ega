// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import {
  interruptPendingTurns,
  addAssistantTurn,
  addUserTurn,
  applyChunk,
  type Turn,
  type AssistantTurnData,
} from '@/sidepanel/state/conversation';
import { createConversation } from '@/sidepanel/state/conversation.svelte';
import {
  loadThreadResult,
  saveThread,
  MAX_TURNS_PER_THREAD,
} from '@/sidepanel/state/conversation-store';
import { asLangIdUnsafe } from '@/shared/brands';

const en = asLangIdUnsafe('en');

function userTurn(id: string, content = 'text'): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content };
}
function assistantTurn(id: string, status: Turn['status'] = 'done'): AssistantTurnData {
  return {
    createdAt: 1,
    id,
    role: 'assistant',
    kind: 'translate',
    status,
    content: 'reply',
    attachedToTurnId: 'u1',
  };
}

beforeEach(() => {
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('interruptPendingTurns', () => {
  it('marks pending assistant turns as error/interrupted', () => {
    const turns: Turn[] = [userTurn('u1'), assistantTurn('a1', 'pending')];
    const out = interruptPendingTurns(turns);
    expect(out[1]?.status).toBe('error');
    expect(out[1]?.error?.code).toBe('interrupted');
  });

  it('marks streaming assistant turns as error/interrupted', () => {
    const turns: Turn[] = [userTurn('u1'), assistantTurn('a1', 'streaming')];
    const out = interruptPendingTurns(turns);
    expect(out[1]?.status).toBe('error');
    expect(out[1]?.error?.code).toBe('interrupted');
  });

  it('leaves done assistant turns unchanged', () => {
    const turns: Turn[] = [userTurn('u1'), assistantTurn('a1', 'done')];
    const out = interruptPendingTurns(turns);
    expect(out[1]?.status).toBe('done');
    expect(out[1]?.error).toBeUndefined();
  });

  it('leaves error turns unchanged', () => {
    const turns: Turn[] = [
      userTurn('u1'),
      { ...assistantTurn('a1', 'error'), error: { code: 'NETWORK', message: 'fail' } },
    ];
    const out = interruptPendingTurns(turns);
    expect(out[1]?.error?.code).toBe('NETWORK');
  });

  it('leaves user turns unchanged', () => {
    const turns: Turn[] = [userTurn('u1'), assistantTurn('a1', 'pending')];
    const out = interruptPendingTurns(turns);
    expect(out[0]?.status).toBe('idle');
  });

  it('repairs variant statuses too', () => {
    const base = addUserTurn([], { id: 'u1', kind: 'translate', content: 'q' });
    const turns = addAssistantTurn(base, { id: 'a1', kind: 'translate', attachedToTurnId: 'u1' });
    // The assistant turn + its v1 variant are pending.
    const out = interruptPendingTurns(turns);
    const assistant = out[1];
    expect(assistant?.status).toBe('error');
    expect(assistant?.variants?.[0]?.status).toBe('error');
    expect(assistant?.variants?.[0]?.error?.code).toBe('interrupted');
  });

  it('repairs a stuck variant even when the top-level turn already settled (done)', () => {
    // A variant dispatch can be mid-stream while the main turn is already done.
    // Early-returning on a terminal top status left that variant stuck forever.
    const assistant = {
      ...assistantTurn('a1', 'done'),
      attachedToTurnId: 'u1',
      variants: [
        { id: 'v1', status: 'done', content: 'first' },
        { id: 'v2', status: 'streaming', content: '' },
      ],
    } as Turn;
    const out = interruptPendingTurns([userTurn('u1'), assistant]);
    expect(out[1]?.status).toBe('done'); // top untouched
    expect(out[1]?.variants?.[0]?.status).toBe('done'); // done variant untouched
    expect(out[1]?.variants?.[1]?.status).toBe('error'); // stuck variant repaired
    expect(out[1]?.variants?.[1]?.error?.code).toBe('interrupted');
  });

  it('with variantIds, stamps only those variants and the top only when the active one is named', () => {
    const assistant = {
      ...assistantTurn('a1', 'streaming'),
      variants: [
        { id: 'v1', status: 'pending', content: '' },
        { id: 'v2', status: 'streaming', content: '' },
      ],
      activeVariantIdx: 1,
    } as Turn;
    const other = interruptPendingTurns([userTurn('u1'), assistant], {
      variantIds: new Set(['v1']),
      message: 'gone',
    });
    expect(other[1]?.status).toBe('streaming');
    expect(other[1]?.variants?.map((v) => v.status)).toEqual(['error', 'streaming']);
    expect(other[1]?.variants?.[0]?.error?.message).toBe('gone');

    const active = interruptPendingTurns([userTurn('u1'), assistant], {
      variantIds: new Set(['v2']),
    });
    expect(active[1]?.status).toBe('error');
    expect(active[1]?.variants?.map((v) => v.status)).toEqual(['pending', 'error']);
  });

  it('setActiveOrigin: a persisted streaming turn loads as an interrupted error', async () => {
    // Persist a streaming turn directly to storage.
    const streamingTurns: Turn[] = [
      userTurn('u1', 'hello'),
      { ...assistantTurn('a1', 'streaming'), content: 'partial', attachedToTurnId: 'u1' },
    ];
    await saveThread('https://reload-test.com', streamingTurns);

    const c = createConversation();
    await c.setActiveOrigin('https://reload-test.com');

    const assistant = c.turns.find((t) => t.role === 'assistant');
    expect(assistant?.status).toBe('error');
    expect(assistant?.error?.code).toBe('interrupted');
    // Retry shows only when the user turn kept its dispatch (canRetry); 'interrupted' is outside ALL_ERR_CODES, so showRetry then allows it.
  });
});

describe('an origin switch leaves the inflight reply to finish in its own thread', () => {
  it('a reply that never answers still reloads as an error, not stuck pending', async () => {
    const c = createConversation({ stallMs: () => 50 });
    await c.setActiveOrigin('https://a.com');
    await c.send({
      content: 'hola',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    // The reply keeps running for a.com after the switch; no chunk ever comes, so its stall guard ends it.
    await c.setActiveOrigin('https://b.com');
    await vi.waitFor(async () => {
      const stored = await loadThreadResult('https://a.com');
      expect(stored.turns.find((t) => t.role === 'assistant')?.status).toBe('error');
    });
    await c.setActiveOrigin('https://a.com');
    const assistant = c.turns.find((t) => t.role === 'assistant');
    expect(assistant?.status).toBe('error');
    expect(assistant?.error?.code).toBe('TIMEOUT');
  });
});

describe('malformed stored turns are dropped on load', () => {
  it('drops turns missing required id field', async () => {
    const key = 'ega:conv:t:https://malformed.com';
    // Write a thread with one valid and one malformed turn directly.
    await chrome.storage.local.set({
      [key]: {
        version: 1,
        origin: 'https://malformed.com',
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
          { role: 'user', kind: 'translate', status: 'idle', content: 'no-id' }, // missing id
        ],
      },
    });
    const loaded = (await loadThreadResult('https://malformed.com')).turns;
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe('u1');
  });

  it('drops turns with invalid role', async () => {
    const key = 'ega:conv:t:https://badrole.com';
    await chrome.storage.local.set({
      [key]: {
        version: 1,
        origin: 'https://badrole.com',
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
          { id: 'x1', role: 'robot', kind: 'translate', status: 'idle', content: 'bad role' },
        ],
      },
    });
    const loaded = (await loadThreadResult('https://badrole.com')).turns;
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe('u1');
  });

  it('drops turns with non-string content', async () => {
    const key = 'ega:conv:t:https://badcontent.com';
    await chrome.storage.local.set({
      [key]: {
        version: 1,
        origin: 'https://badcontent.com',
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
          { id: 'a1', role: 'assistant', kind: 'translate', status: 'done', content: 42 },
        ],
      },
    });
    const loaded = (await loadThreadResult('https://badcontent.com')).turns;
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe('u1');
  });
});

describe('saveThread quota handling', () => {
  it('retries after evicting oldest thread on quota error', async () => {
    // First save succeeds (seeds an existing thread to evict).
    await saveThread('https://old.com', [userTurn('old')]);

    let callCount = 0;
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    vi.spyOn(chrome.storage.local, 'set').mockImplementation((items) => {
      callCount++;
      // Call 1 is the index write; call 2 is the thread blob, which is the path under test.
      if (callCount === 2) return Promise.reject(new Error('QUOTA_BYTES exceeded'));
      return originalSet(items as Record<string, unknown>);
    });

    // Should not throw — evicts old.com and retries.
    await expect(saveThread('https://new.com', [userTurn('new')])).resolves.toEqual({
      evictedOrigin: 'https://old.com',
    });
  });

  it('oversized imageDataUrl is stripped before saving', async () => {
    const bigImage = 'data:image/png;base64,' + 'A'.repeat(300 * 1024); // > 256 KB
    const turns: Turn[] = [
      {
        createdAt: 1,
        id: 'u1',
        role: 'user',
        kind: 'image-translate',
        status: 'idle',
        content: '[image]',
        imageDataUrl: bigImage,
      },
    ];
    await saveThread('https://bigimg.com', turns);
    const loaded = (await loadThreadResult('https://bigimg.com')).turns;
    expect(loaded[0]?.imageDataUrl).toBeUndefined();
  });

  it('index write failure does not throw (thread blob survives)', async () => {
    let writeCount = 0;
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    vi.spyOn(chrome.storage.local, 'set').mockImplementation((items) => {
      writeCount++;
      // Fail only the index write (second set call in saveThread after thread blob).
      if (writeCount === 2) return Promise.reject(new Error('QUOTA_BYTES exceeded'));
      return originalSet(items as Record<string, unknown>);
    });
    // Should not throw.
    await expect(saveThread('https://idxfail.com', [userTurn('t1')])).resolves.toEqual({});
  });
});

describe('streaming renders plain text, not markdown', () => {
  it('streaming turn does NOT run Markdown (no .ega-md element)', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'streaming',
      content: '**bold**',
      attachedToTurnId: 'u1',
    };
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });
    // No markdown container while streaming.
    expect(container.querySelector('.ega-md')).toBeNull();
    // Plain text container is present.
    expect(container.querySelector('.ega-streaming-plain')).not.toBeNull();
    // Raw text shows, not rendered bold.
    expect(container.textContent).toContain('**bold**');
  });

  it('done turn uses Markdown (.ega-md present)', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'hello',
      attachedToTurnId: 'u1',
    };
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });
    // Markdown container present for done turns.
    expect(container.querySelector('.ega-md')).not.toBeNull();
    // Plain streaming span absent.
    expect(container.querySelector('.ega-streaming-plain')).toBeNull();
  });
});

// aria-busy silences a live region only on the region's root (the role=log stream).

describe('the streaming body is hidden from assistive tech', () => {
  it('streaming turn body is aria-hidden', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'streaming',
      content: 'partial',
      attachedToTurnId: 'u1',
    };
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });
    const streaming = container.querySelector('.ega-streaming-plain');
    expect(streaming).not.toBeNull();
    expect(streaming?.getAttribute('aria-hidden')).toBe('true');
  });

  it('done turn body is not hidden from assistive tech', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'done',
      content: 'done',
      attachedToTurnId: 'u1',
    };
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });
    expect(container.querySelector('.ega-streaming-plain')).toBeNull();
  });

  it('no nested live region inside the role=log stream', () => {
    const turn: Turn = {
      createdAt: 1,
      id: 'a1',
      role: 'assistant',
      kind: 'translate',
      status: 'pending',
      content: '',
      attachedToTurnId: 'u1',
    };
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });
    expect(container.querySelector('.ega-stream-skeleton')).not.toBeNull();
    expect(container.querySelector('[aria-live]')).toBeNull();
  });
});

describe('in-memory turns cap', () => {
  it('state.turns never exceeds MAX_TURNS_PER_THREAD after many sends', async () => {
    const c = createConversation();
    await c.setActiveOrigin('https://cap-test.com');

    // Seed MAX_TURNS_PER_THREAD turns into storage so setActiveOrigin loads them.
    const seed: Turn[] = [];
    for (let i = 0; i < MAX_TURNS_PER_THREAD; i++) {
      seed.push(userTurn(`su${i}`, `turn ${i}`));
    }
    await saveThread('https://cap-test.com', seed);
    await c.setActiveOrigin('https://cap-test.com');
    expect(c.turns.length).toBe(MAX_TURNS_PER_THREAD);

    // One more send: array must still be bounded.
    const aId = await c.send({
      content: 'overflow',
      kind: 'translate',
      sourceLang: 'auto',
      targetLang: en,
      stream: false,
    });
    applyChunk(c.turns as Turn[], aId, { type: 'done', requestId: 'r', confidence: 0.9 });
    // After send adds user+assistant (2 turns), total would be MAX+2 — cap trims it.
    expect(c.turns.length).toBeLessThanOrEqual(MAX_TURNS_PER_THREAD);
  });

  it('turns loaded from storage are capped to MAX_TURNS_PER_THREAD in memory', async () => {
    // Save slightly over the limit directly (saveThread trims on write,
    // so use the mock to bypass).
    const origin = 'https://memcap.com';
    const key = 'ega:conv:t:' + origin;
    const tooMany: Turn[] = Array.from({ length: MAX_TURNS_PER_THREAD + 10 }, (_, i) =>
      userTurn(`t${i}`),
    );
    await chrome.storage.local.set({
      [key]: { version: 1, origin, updatedAt: Date.now(), turns: tooMany },
    });
    const c = createConversation();
    await c.setActiveOrigin(origin);
    expect(c.turns.length).toBeLessThanOrEqual(MAX_TURNS_PER_THREAD);
  });
});
