// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

const closeTooltipSpy = vi.fn();
const openTooltipSpy = vi.fn();
const errorTooltipSpy = vi.fn();
const getTooltipBodySpy = vi.fn();

vi.mock('@/content/lazy-tooltip', () => ({
  openTooltip: (...a: unknown[]) => openTooltipSpy(...a),
  closeTooltip: (...a: unknown[]) => closeTooltipSpy(...a),
  errorTooltip: (...a: unknown[]) => errorTooltipSpy(...a),
  getTooltipBody: (...a: unknown[]) => getTooltipBodySpy(...a),
}));

import {
  buildTooltipOpenOpts,
  explainTranslate,
  fireTranslate,
  retryTranslate,
  retranslateWithTask,
  swapTranslate,
  type HandlerDeps,
} from '@/content/translate-handlers';
import {
  beginRequest,
  pending,
  rendererOwner,
  perfTimers,
  setRenderer,
  setStopStreamHook,
  type PendingReq,
} from '@/content/request-state';
import { CONTEXT_INVALIDATED_MESSAGE } from '@/content/context-guard';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

function makeDeps(settings: Record<string, unknown> = {}): HandlerDeps {
  return {
    ensureSettings: vi.fn().mockResolvedValue({
      confidencePill: false,
      tooltipClickOutside: true,
      tooltipShowSource: true,
      tooltipDraggable: false,
      streaming: true,
      explainUsesPageImage: true,
      ...settings,
    }),
  };
}

function seedPending(id: string): PendingReq {
  const req: PendingReq = {
    id,
    text: 'hello',
    rect: {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    } as DOMRect,
    sourceLang: 'auto',
    direction: { source: 'auto', target: 'auto' },
  };
  pending.set(id, req);
  return req;
}

/** A live tooltip request: the row, the owner and an open worker stream. */
function seedLive(id: string): PendingReq {
  const req = seedPending(id);
  beginRequest(id, 'tooltip');
  return req;
}

const cancelled: string[] = [];

beforeEach(() => {
  pending.clear();
  rendererOwner.clear();
  cancelled.length = 0;
  setStopStreamHook((id) => cancelled.push(id));
  // The lazy-tooltip mock above never registers the real renderer, so the close spy stands in for its dispose.
  setRenderer('tooltip', {
    append: vi.fn(),
    finish: vi.fn(),
    error: (...a: unknown[]) => errorTooltipSpy(...a),
    dispose: (...a: unknown[]) => closeTooltipSpy(...a),
  });
  closeTooltipSpy.mockClear();
  openTooltipSpy.mockClear();
  errorTooltipSpy.mockClear();
  getTooltipBodySpy.mockReset();
  getTooltipBodySpy.mockReturnValue(undefined);
});

afterEach(() => {
  setStopStreamHook(null);
});

describe('fireTranslate — error message reflects context invalidation', () => {
  function makeReq(): PendingReq {
    return {
      id: 'r1',
      text: 'hola',
      sourceLang: 'auto',
      rect: new DOMRect(0, 0, 1, 1),
    } as unknown as PendingReq;
  }

  it('shows the reload hint when sendMessage throws context-invalidated', async () => {
    perfTimers.clear();
    const sendMessage = chrome.runtime.sendMessage as Mock;
    sendMessage.mockRejectedValueOnce(new Error('Extension context invalidated.'));
    await fireTranslate(makeReq(), false, true);
    expect(errorTooltipSpy).toHaveBeenCalledWith('r1', {
      code: 'NETWORK',
      message: CONTEXT_INVALIDATED_MESSAGE,
    });
  });

  it('shows the generic message for an ordinary sendMessage failure', async () => {
    perfTimers.clear();
    const sendMessage = chrome.runtime.sendMessage as Mock;
    sendMessage.mockRejectedValueOnce(new Error('network timeout'));
    await fireTranslate(makeReq(), false, true);
    expect(errorTooltipSpy).toHaveBeenCalledWith('r1', {
      code: 'NETWORK',
      message: 'Ega could not send this request. Reload the page and try again.',
    });
  });

  it('paints the failure on the renderer that owns the request', async () => {
    const inlineError = vi.fn();
    setRenderer('inline', { append: vi.fn(), finish: vi.fn(), error: inlineError });
    beginRequest('r1', 'inline');
    const sendMessage = chrome.runtime.sendMessage as Mock;
    sendMessage.mockRejectedValueOnce(new Error('network timeout'));
    await fireTranslate(makeReq(), false, true);
    expect(inlineError).toHaveBeenCalledWith('r1', expect.objectContaining({ code: 'NETWORK' }));
    expect(errorTooltipSpy).not.toHaveBeenCalled();
  });
});

describe('buildTooltipOpenOpts — close and cancel end the request', () => {
  it('onClose cancels the stream once, clears the rows and closes the tooltip', () => {
    const req = seedLive('r-close');
    const opts = buildTooltipOpenOpts(makeDeps(), DEFAULT_SETTINGS, req);

    opts.onClose?.();
    opts.onClose?.();

    expect(cancelled).toEqual(['r-close']);
    expect(pending.has('r-close')).toBe(false);
    expect(rendererOwner.has('r-close')).toBe(false);
    expect(closeTooltipSpy).toHaveBeenCalledWith('r-close');
  });

  it('onCancel does the same', () => {
    const req = seedLive('r-cancel');
    buildTooltipOpenOpts(makeDeps(), DEFAULT_SETTINGS, req).onCancel?.();
    expect(cancelled).toEqual(['r-cancel']);
    expect(pending.has('r-cancel')).toBe(false);
  });
});

describe('explain/retry — end the original before the new tooltip opens', () => {
  it('explainTranslate cancels the original stream before opening the new tooltip', async () => {
    const deps = makeDeps();
    seedLive('orig-id');
    const order: string[] = [];
    setStopStreamHook((id) => order.push(`cancel:${id}`));
    openTooltipSpy.mockImplementation(() => order.push('open'));

    await explainTranslate(deps, 'orig-id');

    expect(order).toEqual(['cancel:orig-id', 'open']);
  });

  // {task:'summarize', explain:true} built the summarize template, so Explain showed a second summary.
  it('Explain on a summarize result asks for an explanation, not the summarize task', async () => {
    const deps = makeDeps({ explainUsesPageImage: false });
    const row = seedPending('sum-id');
    pending.set('sum-id', { ...row, task: 'summarize' });
    rendererOwner.set('sum-id', 'tooltip');
    const sendMessage = chrome.runtime.sendMessage as Mock;
    sendMessage.mockClear();

    await explainTranslate(deps, 'sum-id');

    const sent = sendMessage.mock.calls.at(-1)?.[0] as {
      options?: { explain?: boolean; task?: string };
    };
    expect(sent.options?.explain).toBe(true);
    expect(sent.options?.task).toBeUndefined();
  });

  it('explainUsesPageImage on attaches the page image', async () => {
    const deps = makeDeps();
    seedPending('img-on');
    rendererOwner.set('img-on', 'tooltip');
    document.body.innerHTML = '<img src="https://example.com/big.png">';
    const img = document.querySelector('img');
    if (!img) throw new Error('fixture image missing');
    vi.spyOn(img, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, window.innerWidth, window.innerHeight),
    );
    const sendMessage = chrome.runtime.sendMessage as Mock;
    sendMessage.mockClear();

    await explainTranslate(deps, 'img-on');

    const lastCall = sendMessage.mock.calls.at(-1);
    if (!lastCall) throw new Error('no translate:start message was sent');
    const sent = lastCall[0] as { options?: { imageUrl?: string } };
    expect(sent.options?.imageUrl).toBe('https://example.com/big.png');
    document.body.innerHTML = '';
  });

  it('explainUsesPageImage off sends no image', async () => {
    const deps = makeDeps({ explainUsesPageImage: false });
    seedPending('img-off');
    rendererOwner.set('img-off', 'tooltip');
    document.body.innerHTML = '<img src="https://example.com/big.png">';
    const img = document.querySelector('img');
    if (!img) throw new Error('fixture image missing');
    vi.spyOn(img, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, window.innerWidth, window.innerHeight),
    );
    const sendMessage = chrome.runtime.sendMessage as Mock;
    sendMessage.mockClear();

    await explainTranslate(deps, 'img-off');

    const lastCall = sendMessage.mock.calls.at(-1);
    if (!lastCall) throw new Error('no translate:start message was sent');
    const sent = lastCall[0] as { options?: { imageUrl?: string } };
    expect(sent.options?.imageUrl).toBeUndefined();
    document.body.innerHTML = '';
  });

  it('retryTranslate does nothing when no pending entry exists', async () => {
    const deps = makeDeps();
    await retryTranslate(deps, 'missing-id');
    expect(cancelled).toEqual([]);
    expect(openTooltipSpy).not.toHaveBeenCalled();
  });
});

describe('swapTranslate — ends the original before starting the swapped request', () => {
  it('cancels originalId once, reopens in place and registers the new id as a live tooltip', async () => {
    const deps = makeDeps();
    seedLive('orig-id');

    await swapTranslate(deps, 'orig-id');

    expect(cancelled).toEqual(['orig-id']);
    expect(openTooltipSpy).toHaveBeenCalledTimes(1);
    const [newId] = [...pending.keys()];
    expect(newId).toBeDefined();
    expect(rendererOwner.get(newId ?? '')).toBe('tooltip');
  });

  it('keeps the task and tone of the original; only the direction flips', async () => {
    const deps = makeDeps();
    const req = seedPending('orig-id');
    req.task = 'reword';
    req.tone = 'formal';
    req.direction = { source: 'es', target: 'en' } as PendingReq['direction'];
    rendererOwner.set('orig-id', 'tooltip');

    await swapTranslate(deps, 'orig-id');

    const [newId, stored] = [...pending.entries()][0] ?? [];
    expect(newId).not.toBe('orig-id');
    expect(stored).toMatchObject({
      task: 'reword',
      tone: 'formal',
      direction: { source: 'en', target: 'es' },
      sourceLang: 'en',
      targetLang: 'es',
    });
  });
});

describe('retryTranslate — an explain stays an explain', () => {
  it('re-fires with explain when the original tooltip was an explain', async () => {
    const deps = makeDeps();
    const req = seedPending('orig-id');
    req.explain = true;
    rendererOwner.set('orig-id', 'tooltip');
    const sendMessage = chrome.runtime.sendMessage as Mock;
    sendMessage.mockClear();

    await retryTranslate(deps, 'orig-id');

    const start = sendMessage.mock.calls
      .map((c) => c[0] as { kind?: string; options?: { explain?: boolean } })
      .find((m) => m.kind === 'translate:start');
    expect(start?.options?.explain).toBe(true);
    const stored = [...pending.values()][0];
    expect(stored?.explain).toBe(true);
  });
});

describe('an explain re-run names the task whose switches the router applies', () => {
  it('opens the tooltip with contextTask explain, while a plain retry names none', async () => {
    const deps = makeDeps();
    seedPending('orig-id');
    rendererOwner.set('orig-id', 'tooltip');
    await explainTranslate(deps, 'orig-id');
    const explainArgs = openTooltipSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(explainArgs['contextTask']).toBe('explain');

    seedPending('plain-id');
    rendererOwner.set('plain-id', 'tooltip');
    await retryTranslate(deps, 'plain-id');
    const plainArgs = openTooltipSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(plainArgs['contextTask']).toBeUndefined();
  });
});

describe('reopenTooltip — threads confidencePillThreshold to the new tooltip', () => {
  it('explainTranslate openTooltip receives confidencePillThreshold from settings', async () => {
    // Pin a non-default threshold so the assertion proves the value propagates.
    const deps = makeDeps({ confidencePill: true, confidencePillThreshold: 0.42 });
    seedPending('orig-id');
    rendererOwner.set('orig-id', 'tooltip');

    await explainTranslate(deps, 'orig-id');

    expect(openTooltipSpy).toHaveBeenCalledTimes(1);
    const openArgs = openTooltipSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(openArgs['confidencePill']).toBe(true);
    expect(openArgs['confidencePillThreshold']).toBe(0.42);
  });

  it('retryTranslate openTooltip receives confidencePillThreshold from settings', async () => {
    const deps = makeDeps({ confidencePill: true, confidencePillThreshold: 0.7 });
    seedPending('orig-id');
    rendererOwner.set('orig-id', 'tooltip');

    await retryTranslate(deps, 'orig-id');

    expect(openTooltipSpy).toHaveBeenCalledTimes(1);
    const openArgs = openTooltipSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(openArgs['confidencePillThreshold']).toBe(0.7);
  });

  it('omits confidencePillThreshold when undefined (avoids forwarding noise into Svelte props)', async () => {
    const deps = makeDeps({ confidencePill: true });
    seedPending('orig-id');
    rendererOwner.set('orig-id', 'tooltip');

    await explainTranslate(deps, 'orig-id');

    const openArgs = openTooltipSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('confidencePillThreshold' in openArgs).toBe(false);
  });
});

describe('reopenTooltip — no diff on a task switch', () => {
  it('retranslateWithTask omits priorTranslation when task changes', async () => {
    const deps = makeDeps();
    getTooltipBodySpy.mockReturnValue('prior translate body');
    const req = seedPending('orig-id');
    req.task = 'translate';
    rendererOwner.set('orig-id', 'tooltip');

    await retranslateWithTask(deps, 'orig-id', 'explain', 'neutral');

    const openArgs = openTooltipSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('priorTranslation' in openArgs).toBe(false);
  });

  it('explainTranslate omits priorTranslation (task switches to explain)', async () => {
    const deps = makeDeps();
    getTooltipBodySpy.mockReturnValue('prior translate body');
    seedPending('orig-id');
    rendererOwner.set('orig-id', 'tooltip');

    await explainTranslate(deps, 'orig-id');

    const openArgs = openTooltipSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('priorTranslation' in openArgs).toBe(false);
  });

  it('retryTranslate keeps priorTranslation when task is unchanged', async () => {
    const deps = makeDeps();
    getTooltipBodySpy.mockReturnValue('prior translate body');
    const req = seedPending('orig-id');
    req.task = 'translate';
    rendererOwner.set('orig-id', 'tooltip');

    await retryTranslate(deps, 'orig-id');

    const openArgs = openTooltipSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(openArgs['priorTranslation']).toBe('prior translate body');
  });
});

describe('reopenTooltip — shimmer label on explain-flag re-runs', () => {
  it('explainTranslate opens the tooltip with loadingLabel "Explaining"', async () => {
    const deps = makeDeps();
    seedPending('orig-id');
    rendererOwner.set('orig-id', 'tooltip');

    await explainTranslate(deps, 'orig-id');

    const openArgs = openTooltipSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(openArgs['loadingLabel']).toBe('Explaining');
  });

  it('retryTranslate opens the tooltip without a loadingLabel override', async () => {
    const deps = makeDeps();
    seedPending('orig-id');
    rendererOwner.set('orig-id', 'tooltip');

    await retryTranslate(deps, 'orig-id');

    const openArgs = openTooltipSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('loadingLabel' in openArgs).toBe(false);
  });

  it('retranslateWithTask relies on the task gerund, no loadingLabel override', async () => {
    const deps = makeDeps();
    seedPending('orig-id');
    rendererOwner.set('orig-id', 'tooltip');

    await retranslateWithTask(deps, 'orig-id', 'summarize', 'neutral');

    const openArgs = openTooltipSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('loadingLabel' in openArgs).toBe(false);
    expect(openArgs['task']).toBe('summarize');
  });
});

describe('reopenTooltip — forwards priorTranslation for diff render', () => {
  it('threads getTooltipBody(originalId) into openTooltip as priorTranslation on same-task retry', async () => {
    const deps = makeDeps();
    getTooltipBodySpy.mockReturnValue('Hello world');
    const req = seedPending('orig-id');
    req.task = 'translate';
    rendererOwner.set('orig-id', 'tooltip');

    await retryTranslate(deps, 'orig-id');

    expect(getTooltipBodySpy).toHaveBeenCalledWith('orig-id');
    const openArgs = openTooltipSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(openArgs['priorTranslation']).toBe('Hello world');
  });

  it('reads the prior body BEFORE the original ends (its close clears the entry)', async () => {
    const deps = makeDeps();
    const callOrder: string[] = [];
    getTooltipBodySpy.mockImplementation((id: string) => {
      callOrder.push(`getBody:${id}`);
      return 'Hello';
    });
    setStopStreamHook((id) => callOrder.push(`cancel:${id}`));
    closeTooltipSpy.mockImplementation((id: string) => {
      callOrder.push(`close:${id}`);
    });
    seedLive('orig-id');

    await explainTranslate(deps, 'orig-id');

    expect(callOrder).toEqual(['getBody:orig-id', 'cancel:orig-id', 'close:orig-id']);
  });

  it('omits priorTranslation when getTooltipBody returns undefined (first translate / errored prior)', async () => {
    const deps = makeDeps();
    getTooltipBodySpy.mockReturnValue(undefined);
    seedPending('orig-id');
    rendererOwner.set('orig-id', 'tooltip');

    await explainTranslate(deps, 'orig-id');

    const openArgs = openTooltipSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('priorTranslation' in openArgs).toBe(false);
  });
});

describe('reopenTooltip — the attached image is one-shot', () => {
  it('sends imageUrl on the explain dispatch but does not keep it for the next one', async () => {
    const deps = makeDeps();
    const sendMessage = chrome.runtime.sendMessage as Mock;
    sendMessage.mockClear();
    seedPending('orig-id');
    rendererOwner.set('orig-id', 'tooltip');
    const img = document.createElement('img');
    img.src = 'https://example.com/hero.png';
    Object.defineProperty(img, 'naturalWidth', { value: 900 });
    Object.defineProperty(img, 'naturalHeight', { value: 700 });
    img.getBoundingClientRect = () =>
      ({ width: 900, height: 700, top: 0, left: 0, right: 900, bottom: 700 }) as DOMRect;
    document.body.appendChild(img);

    await explainTranslate(deps, 'orig-id');
    const explainStart = sendMessage.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((m) => m['kind'] === 'translate:start');
    expect((explainStart?.['options'] as Record<string, unknown>)['imageUrl']).toBe(img.src);

    const explainId = [...pending.keys()][0];
    if (explainId === undefined) throw new Error('expected a pending request');
    expect(pending.get(explainId)?.imageUrl).toBeUndefined();

    sendMessage.mockClear();
    await retranslateWithTask(deps, explainId, 'summarize', 'neutral');

    const start = sendMessage.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((m) => m['kind'] === 'translate:start');
    expect((start?.['options'] as Record<string, unknown>)['imageUrl']).toBeUndefined();
    img.remove();
  });
});

// Explain is a property of one request: a task change on an explained tooltip is a new request.
describe('retranslateWithTask after explainTranslate', () => {
  it('does not inherit explain', async () => {
    const deps = makeDeps();
    seedPending('exp-id');
    rendererOwner.set('exp-id', 'tooltip');
    const sendMessage = chrome.runtime.sendMessage as Mock;
    type Start = { kind?: string; requestId?: string; options?: { explain?: boolean } };
    const starts = () =>
      sendMessage.mock.calls.map((c) => c[0] as Start).filter((m) => m.kind === 'translate:start');

    sendMessage.mockClear();
    await explainTranslate(deps, 'exp-id');
    const explained = starts().at(-1);
    expect(explained?.options?.explain).toBe(true);

    sendMessage.mockClear();
    await retranslateWithTask(deps, explained?.requestId ?? '', 'summarize', 'neutral');
    expect(starts().at(-1)?.options?.explain).toBe(false);
  });
});

describe('buildTooltipOpenOpts — the Open settings sender', () => {
  function toastText(): string {
    const root = document.getElementById('ega-shadow-host')?.shadowRoot;
    return root?.querySelector('[data-ega-toast-wrap]')?.textContent ?? '';
  }

  it('sends the tab the error names', () => {
    const sendMessage = chrome.runtime.sendMessage as Mock;
    const opts = buildTooltipOpenOpts(makeDeps(), DEFAULT_SETTINGS, seedPending('o1'));
    opts.onOpenOptions?.('backends');
    expect(sendMessage).toHaveBeenLastCalledWith({ kind: 'ui:open-options', tab: 'backends' });
  });

  it('a dead context that throws synchronously shows the reload hint instead of escaping', () => {
    const sendMessage = chrome.runtime.sendMessage as Mock;
    sendMessage.mockImplementationOnce(() => {
      throw new Error('Extension context invalidated.');
    });
    const opts = buildTooltipOpenOpts(makeDeps(), DEFAULT_SETTINGS, seedPending('o2'));
    expect(() => opts.onOpenOptions?.()).not.toThrow();
    expect(toastText()).toContain('reload the page');
  });
});
