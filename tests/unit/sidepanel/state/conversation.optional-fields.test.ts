// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addAssistantTurn,
  addUserTurn,
  applyChunk,
  buildStartArgs,
} from '@/sidepanel/state/conversation';
import type { Turn } from '@/sidepanel/state/conversation';
import { sel } from '@tests/_helpers/lang';

function has(o: object, key: string): boolean {
  return key in o;
}

describe('a user turn carries only the optional fields it was given', () => {
  it('carries each one when present', () => {
    const [turn] = addUserTurn([], {
      id: 'u1',
      kind: 'translate',
      content: 'hi',
      imageDataUrl: 'data:image/png;base64,AAA',
      tone: 'formal',
      dispatch: { sourceLang: sel('auto'), targetLang: sel('en'), stream: true },
    });

    expect(turn?.imageDataUrl).toBe('data:image/png;base64,AAA');
    expect(turn?.tone).toBe('formal');
    expect(turn?.dispatch).toEqual({ sourceLang: 'auto', targetLang: 'en', stream: true });
  });

  it('leaves each one off entirely when absent, rather than writing undefined', () => {
    const [turn] = addUserTurn([], { id: 'u1', kind: 'translate', content: 'hi' });

    expect(turn && has(turn, 'imageDataUrl')).toBe(false);
    expect(turn && has(turn, 'tone')).toBe(false);
    expect(turn && has(turn, 'dispatch')).toBe(false);
  });
});

describe('a pending assistant turn', () => {
  const base = { id: 'a1', kind: 'translate', attachedToTurnId: 'u1' } as const;

  it('carries contextSent, retries and explain when given', () => {
    const [turn] = addAssistantTurn([], {
      ...base,
      contextSent: { pageUrl: 'https://a.com' },
      retries: 2,
      explain: 'a pinned gloss',
    });

    expect(turn?.contextSent).toEqual({ pageUrl: 'https://a.com' });
    expect(turn?.retries).toBe(2);
    expect(turn?.explain).toBe('a pinned gloss');
    expect(turn?.variants?.[0]?.explain).toBe('a pinned gloss');
  });

  it('leaves them off when absent', () => {
    const [turn] = addAssistantTurn([], base);

    expect(turn && has(turn, 'contextSent')).toBe(false);
    expect(turn && has(turn, 'retries')).toBe(false);
    expect(turn && has(turn, 'explain')).toBe(false);
    expect(turn?.variants?.[0] && has(turn.variants[0], 'explain')).toBe(false);
  });

  it('names its seed variant v1, and keeps a preserved answer as v0 behind it', () => {
    const [plain] = addAssistantTurn([], base);
    expect(plain?.variants?.map((v) => v.id)).toEqual(['a1:v1']);
    expect(plain?.activeVariantIdx).toBe(0);

    const [edited] = addAssistantTurn([], { ...base, preservedResponse: 'the old answer' });
    expect(edited?.variants?.map((v) => v.id)).toEqual(['a1:v0', 'a1:v1']);
    expect(edited?.variants?.[0]).toMatchObject({ status: 'done', content: 'the old answer' });
    expect(edited?.activeVariantIdx).toBe(1);
  });

  it('takes an explicit variantId over the generated one', () => {
    const [turn] = addAssistantTurn([], { ...base, variantId: 'chosen' });

    expect(turn?.variants?.map((v) => v.id)).toEqual(['chosen']);
  });

  it('seeds the variant with an empty rawAcc, so the first delta appends to nothing', () => {
    const [turn] = addAssistantTurn([], base);

    expect(turn?.variants?.[0]?.rawAcc).toBe('');
  });
});

describe('the request a turn builds', () => {
  function userTurn(over: Partial<Turn> = {}): Turn {
    return {
      id: 'u1',
      role: 'user',
      kind: 'translate',
      status: 'idle',
      createdAt: 1,
      content: 'hello',
      ...over,
    };
  }

  const reuse = { sourceLang: sel('auto'), targetLang: sel('en'), stream: true };

  it('carries tone, context, refinement and history when given', () => {
    const args = buildStartArgs(userTurn(), {
      requestId: 'r1',
      reuse,
      tone: 'formal',
      context: { pageUrl: 'https://a.com' },
      seed: { refinementBody: 'shorter' },
      history: [{ role: 'user', content: 'earlier' }],
    });

    expect(args.tone).toBe('formal');
    expect(args.context).toEqual({ pageUrl: 'https://a.com' });
    expect(args.refinement).toBe('shorter');
    expect(args.conversationHistory).toEqual([{ role: 'user', content: 'earlier' }]);
  });

  it('leaves each off when absent', () => {
    const args = buildStartArgs(userTurn(), { requestId: 'r1', reuse });

    expect(has(args, 'tone')).toBe(false);
    expect(has(args, 'context')).toBe(false);
    expect(has(args, 'refinement')).toBe(false);
    expect(has(args, 'conversationHistory')).toBe(false);
    expect(has(args, 'imageUrl')).toBe(false);
    expect(has(args, 'task')).toBe(false);
  });

  it('sends the image and drops the history, which the image path cannot carry', () => {
    const args = buildStartArgs(userTurn({ imageDataUrl: 'data:image/png;base64,AAA' }), {
      requestId: 'r1',
      reuse,
      history: [{ role: 'user', content: 'earlier' }],
    });

    expect(args.imageUrl).toBe('data:image/png;base64,AAA');
    expect(has(args, 'conversationHistory')).toBe(false);
  });

  it('names the task unless it is translate, and sets explain from it', () => {
    const explained = buildStartArgs(userTurn(), {
      requestId: 'r1',
      reuse,
      seed: { task: 'explain' },
    });
    expect(explained.task).toBe('explain');
    expect(explained.explain).toBe(true);

    const translated = buildStartArgs(userTurn(), {
      requestId: 'r1',
      reuse,
      seed: { task: 'translate' },
    });
    expect(has(translated, 'task')).toBe(false);
    expect(translated.explain).toBe(false);
  });

  it('drops an empty history rather than sending an empty list', () => {
    const args = buildStartArgs(userTurn(), { requestId: 'r1', reuse, history: [] });

    expect(has(args, 'conversationHistory')).toBe(false);
  });
});

describe('the retry window on a failed variant', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function errored(retryAfterMs?: number): Turn | undefined {
    const turns = addAssistantTurn([], { id: 'a1', kind: 'translate', attachedToTurnId: 'u1' });
    return applyChunk(turns, 'a1', {
      type: 'error',
      requestId: 'r1',
      code: 'RATE_LIMIT',
      message: 'slow down',
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    })[0];
  }

  it('sets a window from the server hint', () => {
    expect(errored(5_000)?.variants?.[0]?.error?.retryUntil).toBe(Date.now() + 5_000);
  });

  it('caps a bogus hint at 60 seconds', () => {
    expect(errored(999_999)?.variants?.[0]?.error?.retryUntil).toBe(Date.now() + 60_000);
  });

  it('sets no window without a hint, or for a zero one', () => {
    const noHint = errored()?.variants?.[0]?.error;
    const zero = errored(0)?.variants?.[0]?.error;

    expect(noHint && has(noHint, 'retryUntil')).toBe(false);
    expect(zero && has(zero, 'retryUntil')).toBe(false);
  });
});
