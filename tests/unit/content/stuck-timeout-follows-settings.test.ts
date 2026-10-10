// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openTooltip, closeTooltip } from '@/content/tipState.svelte';
import { openInline, appendInlineDelta, restoreAllInline } from '@/content/inlineReplace';
import { buildTooltipOpenOpts, type HandlerDeps } from '@/content/translate-handlers';
import { stuckTimeoutMs, imageStuckTimeoutMs } from '@/shared/stuck-timeout';
import { mountShadowHost, getContainer } from '@/content/shadowHost';
import { setStopStreamHook, type PendingReq } from '@/content/request-state';
import {
  DEFAULT_TRANSLATE_TIMEOUT_MS,
  DEFAULT_IMAGE_TRANSLATE_TIMEOUT_MS,
} from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { sel } from '@tests/_helpers/lang';

// The router honors the user's translateTimeoutMs; a renderer guard pinned at 90s paints a fake error first.

function rect(): DOMRect {
  return {
    x: 50,
    y: 50,
    left: 50,
    top: 50,
    right: 150,
    bottom: 70,
    width: 100,
    height: 20,
    toJSON: () => ({}),
  } as DOMRect;
}

function req(id: string): PendingReq {
  const auto = sel('auto');
  const en = sel('en');
  return {
    id,
    text: 'hello',
    rect: rect(),
    sourceLang: auto,
    direction: { source: auto, target: en },
  };
}

const deps = {
  ensureSettings: () => Promise.resolve(DEFAULT_SETTINGS),
  lazyInline: () => Promise.resolve({}),
  startTranslateText: () => Promise.resolve(),
  cancelTranslate: () => Promise.resolve(),
} as unknown as HandlerDeps;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-ega-host-installed');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
  mountShadowHost();
});

afterEach(() => {
  closeTooltip();
  restoreAllInline();
  setStopStreamHook(null);
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('the stuck timeout has one source of truth', () => {
  it('derives the tooltip ceiling from the user timeout, not a fixed 90s', () => {
    const opts = buildTooltipOpenOpts(
      deps,
      { ...DEFAULT_SETTINGS, translateTimeoutMs: 300_000 },
      req('r1'),
    );
    expect(opts.stuckTimeoutMs).toBe(330_000);
  });

  it('an explain that carries a page image gets the vision ceiling, not the text one', () => {
    const s = { ...DEFAULT_SETTINGS, translateTimeoutMs: 60_000, imageTranslateTimeoutMs: 120_000 };
    const withImage = { ...req('r-img'), imageUrl: 'https://example.com/post.png' };
    expect(buildTooltipOpenOpts(deps, s, withImage).stuckTimeoutMs).toBe(150_000);
    expect(buildTooltipOpenOpts(deps, s, req('r-text')).stuckTimeoutMs).toBe(90_000);
  });

  it('falls back to the shipped budget when the user never set one', () => {
    expect(stuckTimeoutMs({})).toBe(DEFAULT_TRANSLATE_TIMEOUT_MS + 30_000);
    expect(imageStuckTimeoutMs(null)).toBe(DEFAULT_IMAGE_TRANSLATE_TIMEOUT_MS + 30_000);
  });

  it('a raised timeout means no fake error at the old 90s mark', async () => {
    openTooltip({ requestId: 'r1', srcText: 'hi', rect: rect(), stuckTimeoutMs: 330_000 });
    vi.advanceTimersByTime(DEFAULT_TRANSLATE_TIMEOUT_MS + 30_000 + 1_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(getContainer().textContent).not.toMatch(/no answer in time/i);
  });

  it('the tooltip stuck path stops the worker stream as well as painting the error', async () => {
    const stopped: string[] = [];
    setStopStreamHook((id) => stopped.push(id));
    openTooltip({ requestId: 'r-stuck', srcText: 'hi', rect: rect(), stuckTimeoutMs: 1_000 });
    vi.advanceTimersByTime(1_100);
    await Promise.resolve();
    await Promise.resolve();
    expect(stopped).toEqual(['r-stuck']);
    expect(getContainer().textContent).toMatch(/no answer in time/i);
  });

  it('the inline stuck path honors the passed ceiling and stops the stream', () => {
    document.body.innerHTML = '<p id="p">bonjour le monde</p>';
    const p = document.getElementById('p');
    if (!p?.firstChild) throw new Error('test setup: paragraph text node missing');
    const r = document.createRange();
    r.setStart(p.firstChild, 0);
    r.setEnd(p.firstChild, p.firstChild.textContent?.length ?? 0);
    const stopped: string[] = [];
    setStopStreamHook((id) => stopped.push(id));

    openInline({ requestId: 'i1', range: r, stuckTimeoutMs: 300_000 });
    vi.advanceTimersByTime(120_000);
    expect(stopped).toEqual([]);
    expect(document.querySelector('[data-ega-error]')).toBeNull();

    vi.advanceTimersByTime(181_000);
    expect(stopped).toEqual(['i1']);
    expect(document.querySelector('[data-ega-error]')).not.toBeNull();
  });

  it('an inline delta re-arms the guard, and silence after it still fails', () => {
    document.body.innerHTML = '<p id="p">bonjour le monde</p>';
    const p = document.getElementById('p');
    if (!p?.firstChild) throw new Error('test setup: paragraph text node missing');
    const r = document.createRange();
    r.setStart(p.firstChild, 0);
    r.setEnd(p.firstChild, p.firstChild.textContent?.length ?? 0);
    const stopped: string[] = [];
    setStopStreamHook((id) => stopped.push(id));

    openInline({ requestId: 'i2', range: r, stuckTimeoutMs: 10_000 });
    for (let i = 0; i < 4; i++) {
      appendInlineDelta('i2', 'x');
      vi.advanceTimersByTime(9_000);
    }
    expect(stopped).toEqual([]);

    vi.advanceTimersByTime(10_100);
    expect(stopped).toEqual(['i2']);
  });
});
