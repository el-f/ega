// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  appendInlineDelta,
  errorInline,
  finishInline,
  openInline,
  restoreAllInline,
} from '@/content/inlineReplace';
import { dismissToast } from '@/content/toast';
import { setStopStreamHook } from '@/content/request-state';
import { errCodeLabel } from '@/shared/err-labels';

// Inline replace has no Retry by design, so the reason is the only recovery signal.

function selectParagraph(): Range {
  document.body.innerHTML = '<p id="p">bonjour le monde</p>';
  const p = document.getElementById('p');
  if (!p?.firstChild) throw new Error('test setup: paragraph text node missing');
  const r = document.createRange();
  r.setStart(p.firstChild, 0);
  r.setEnd(p.firstChild, p.firstChild.textContent?.length ?? 0);
  return r;
}

function wrapper(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-ega-replaced][data-ega-error="true"]');
  if (!el) throw new Error('no errored inline wrapper');
  return el;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});

afterEach(() => {
  dismissToast();
  restoreAllInline();
  setStopStreamHook(null);
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('inline.error.shows-reason', () => {
  it('inline.error.shows-reason — the failure names itself in visible text, not only in a title', () => {
    const range = selectParagraph();
    setStopStreamHook(() => {});
    openInline({ requestId: 'i1', range, stuckTimeoutMs: 1_000 });

    // The stall guard is the real producer here: no reply ever arrives.
    vi.advanceTimersByTime(1_100);

    const w = wrapper();
    const chip = w.querySelector('[data-ega-tx-error]');
    expect(chip?.textContent).toContain(errCodeLabel('TIMEOUT'));
    // The page's own text stays readable beside the reason.
    expect(w.textContent).toContain('bonjour le monde');
  });

  it('keeps the full detail on the title and adds no retry button', () => {
    const range = selectParagraph();
    setStopStreamHook(() => {});
    openInline({ requestId: 'i2', range, stuckTimeoutMs: 1_000 });
    vi.advanceTimersByTime(1_100);

    const w = wrapper();
    expect(w.getAttribute('title')).toContain('No reply in time');
    expect(w.querySelector('button')).toBeNull();
  });

  it('restore puts the page text back, chip and all', () => {
    const range = selectParagraph();
    setStopStreamHook(() => {});
    openInline({ requestId: 'i3', range, stuckTimeoutMs: 1_000 });
    vi.advanceTimersByTime(1_100);

    restoreAllInline();
    expect(document.querySelector('[data-ega-tx-error]')).toBeNull();
    expect(document.getElementById('p')?.textContent).toBe('bonjour le monde');
  });
});

describe('inline.done.empty-body', () => {
  it('a done frame with no visible text fails the span instead of leaving it shimmering', () => {
    const range = selectParagraph();
    setStopStreamHook(() => {});
    openInline({ requestId: 'i-empty', range, stuckTimeoutMs: 1_000 });
    appendInlineDelta('i-empty', '{"translation": ""}');
    finishInline('i-empty', { confidence: 1 });
    const el = wrapper();
    expect(el.getAttribute('data-ega-error')).toBe('true');
    expect(el.textContent).toContain(errCodeLabel('SERVER'));
  });
});

describe('inline.error.fix-toast', () => {
  function toast(): HTMLElement | null {
    const root = document.getElementById('ega-shadow-host')?.shadowRoot;
    return root?.querySelector<HTMLElement>('[data-ega-toast-wrap]') ?? null;
  }

  it('a failure a setting fixes says so on the page, with Open settings', () => {
    const range = selectParagraph();
    openInline({ requestId: 'i-fix', range, stuckTimeoutMs: 1_000 });
    errorInline('i-fix', {
      code: 'NO_BACKEND',
      message: 'No backend is set up yet. Open Settings → Backends and add an API key.',
    });
    expect(toast()?.textContent).toContain('Open Settings → Backends');
    expect(toast()?.querySelector('[data-ega-toast-action]')?.textContent).toBe('Open settings');
  });

  it('the stall timeout, which no setting fixes, adds no toast', () => {
    const range = selectParagraph();
    setStopStreamHook(() => {});
    openInline({ requestId: 'i-stall', range, stuckTimeoutMs: 1_000 });
    vi.advanceTimersByTime(1_100);
    expect(toast()).toBeNull();
  });
});
