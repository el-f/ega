// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  openInline,
  appendInlineDelta,
  finishInline,
  errorInline,
  restoreInline,
  restoreAllInline,
  inlineCount,
} from '@/content/inlineReplace';
import {
  pending,
  rendererOwner,
  setStopStreamHook,
  type PendingReq,
} from '@/content/request-state';
import { invariant } from '@/shared/invariants';
import { chipText } from '@tests/_helpers/page-translate';

const INLINE_STUCK_MS = 90_000;

function rangeOver(textNode: Node, start: number, end: number): Range {
  const r = document.createRange();
  r.setStart(textNode, start);
  r.setEnd(textNode, end);
  return r;
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  invariant(el, `test setup: #${id} not found`);
  return el;
}

function firstChildOf(el: Node): Node {
  const c = el.firstChild;
  invariant(c, 'test setup: element has no first child');
  return c;
}

function textLen(el: Node): number {
  const t = el.textContent;
  invariant(t !== null, 'test setup: element has no textContent');
  return t.length;
}

describe('inlineReplace', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<p id="p">mar7aba, kifak? shu 3am ta3mel?</p><p id="q">untouched</p>';
  });
  afterEach(() => {
    restoreAllInline();
    document.body.innerHTML = '';
  });

  it('openInline wraps the range and keeps the original text readable while pending', () => {
    const p = byId('p');
    const original = p.textContent;
    const range = rangeOver(firstChildOf(p), 0, textLen(p));
    openInline({ requestId: 'r1', range, stuckTimeoutMs: INLINE_STUCK_MS });
    const wrap = p.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    expect(wrap).not.toBeNull();
    // The paragraph must not collapse to a placeholder chip during the latency window.
    expect(wrap.textContent).toBe(original);
    expect(wrap.hasAttribute('data-ega-pending')).toBe(true);
    expect(inlineCount()).toBe(1);
  });

  it('sets dir="auto" on the wrapper so RTL translations get correct bidi', () => {
    // The wrapper sits in the LTR host page, so RTL output misorders without dir="auto".
    const p = byId('p');
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, textLen(p)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    const wrap = p.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    expect(wrap.getAttribute('dir')).toBe('auto');
  });

  it('appendInlineDelta streams text into the span', () => {
    const p = byId('p');
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, textLen(p)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{"translation":"Hello ');
    appendInlineDelta('r1', 'and welcome"}');
    const wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    expect(wrap.textContent).toContain('Hello and welcome');
  });

  it('keeps the original visible during JSON-envelope-only deltas', () => {
    // An empty inline span has no visual presence — the user sees the selection vanish.
    const p = byId('p');
    const original = p.textContent;
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, original.length),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    // Real streams open with envelope-only chunks; each one parses to translation === ''.
    appendInlineDelta('r1', '{');
    let wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    expect(wrap.textContent).toBe(original);
    appendInlineDelta('r1', '"trans');
    appendInlineDelta('r1', 'lation":"');
    wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    expect(wrap.textContent).toBe(original);
    expect(wrap.hasAttribute('data-ega-pending')).toBe(true);
    appendInlineDelta('r1', 'He');
    wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    expect(wrap.hasAttribute('data-ega-pending')).toBe(false);
    expect(wrap.textContent).toBe('He');
  });

  it('finishInline with envelope-only rawAcc keeps the original text and marks the failure', () => {
    // A cut-off stream can emit done while the accumulator is still only the JSON envelope.
    const p = byId('p');
    const original = p.textContent;
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, original.length),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{');
    finishInline('r1', { confidence: 0.5 });
    const wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    expect(wrap.textContent).toContain(original);
    expect(chipText(wrap)).toBe('Empty answer');
    expect(wrap.hasAttribute('data-ega-pending')).toBe(false);
  });

  it('finishInline attaches click-hold + hover behavior; mouse-down shows original', () => {
    const p = byId('p');
    const original = p.textContent;
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, original.length),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{"translation":"Hello"}');
    finishInline('r1', { confidence: 0.9 });
    const wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    expect(wrap.textContent).toBe('Hello');
    expect(wrap.getAttribute('title')).toContain(original);
    wrap.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(wrap.textContent).toBe(original);
    wrap.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(wrap.textContent).toBe('Hello');
  });

  it('errorInline marks the span red and names the cause on the chip, never in a title', () => {
    const p = byId('p');
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, textLen(p)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    errorInline('r1', { code: 'NETWORK', message: 'offline' });
    const wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    expect(wrap.getAttribute('data-ega-error')).toBe('true');
    expect(chipText(wrap)).toBe('No connection');
    // The raw text and the code never reach the UI.
    expect(wrap.hasAttribute('title')).toBe(false);
    expect(wrap.textContent).not.toContain('offline');
  });

  it('restoreInline puts the original DOM back and removes the wrapper', () => {
    const p = byId('p');
    const original = p.textContent;
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, original.length),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{"translation":"Hello"}');
    finishInline('r1', { confidence: 0.9 });
    restoreInline('r1');
    expect(document.querySelector('[data-ega-replaced="r1"]')).toBeNull();
    expect(p.textContent).toBe(original);
    expect(inlineCount()).toBe(0);
  });

  it('restoreAllInline restores every wrapper and deregisters Esc listener', () => {
    const p = byId('p');
    const q = byId('q');
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, textLen(p)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    openInline({
      requestId: 'r2',
      range: rangeOver(firstChildOf(q), 0, textLen(q)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    expect(inlineCount()).toBe(2);
    restoreAllInline();
    expect(inlineCount()).toBe(0);
    expect(document.querySelectorAll('[data-ega-replaced]').length).toBe(0);
  });

  it('Escape keydown triggers restoreAllInline', () => {
    const p = byId('p');
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, textLen(p)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(inlineCount()).toBe(0);
  });

  it('stuck-timer flips to TIMEOUT when no chunk arrives within 90s (service worker evicted)', () => {
    vi.useFakeTimers();
    try {
      const p = byId('p');
      openInline({
        requestId: 'r1',
        range: rangeOver(firstChildOf(p), 0, textLen(p)),
        stuckTimeoutMs: INLINE_STUCK_MS,
      });
      // Nothing arrives from the SW — it died mid-flight.
      vi.advanceTimersByTime(89_000);
      let wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
      expect(wrap.getAttribute('data-ega-error')).toBeNull();
      vi.advanceTimersByTime(2_000);
      wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
      expect(wrap.getAttribute('data-ega-error')).toBe('true');
      expect(chipText(wrap)).toBe('No answer in time');
    } finally {
      vi.useRealTimers();
    }
  });

  it('every delta re-arms the stuck-timer, and the gap after the last one still flips', () => {
    vi.useFakeTimers();
    try {
      const p = byId('p');
      openInline({
        requestId: 'r1',
        range: rangeOver(firstChildOf(p), 0, textLen(p)),
        stuckTimeoutMs: INLINE_STUCK_MS,
      });
      const wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;

      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(INLINE_STUCK_MS - 1000);
        appendInlineDelta('r1', `chunk ${String(i)} `);
        expect(wrap.getAttribute('data-ega-error')).toBeNull();
      }

      vi.advanceTimersByTime(INLINE_STUCK_MS + 100);
      expect(wrap.getAttribute('data-ega-error')).toBe('true');
      expect(chipText(wrap)).toBe('No answer in time');
    } finally {
      vi.useRealTimers();
    }
  });

  it('finishInline clears the stuck-timer (no late fire on completed translation)', () => {
    vi.useFakeTimers();
    try {
      const p = byId('p');
      openInline({
        requestId: 'r1',
        range: rangeOver(firstChildOf(p), 0, textLen(p)),
        stuckTimeoutMs: INLINE_STUCK_MS,
      });
      appendInlineDelta('r1', '{"translation":"Hello"}');
      finishInline('r1', { confidence: 0.9 });
      vi.advanceTimersByTime(200_000);
      const wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
      expect(wrap.getAttribute('data-ega-error')).toBeNull();
      expect(wrap.textContent).toBe('Hello');
    } finally {
      vi.useRealTimers();
    }
  });

  it('late delta after finishInline does not re-paint body', () => {
    const p = byId('p');
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, textLen(p)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{"translation":"Hello"}');
    finishInline('r1', { confidence: 0.9 });
    const wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    expect(wrap.textContent).toBe('Hello');
    appendInlineDelta('r1', '{"translation":"Goodbye"}');
    expect(wrap.textContent).toBe('Hello');
  });

  it('late error after finishInline does not corrupt finished wrapper', () => {
    const p = byId('p');
    const original = p.textContent;
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, original.length),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{"translation":"Hello"}');
    finishInline('r1', { confidence: 0.9 });
    errorInline('r1', { code: 'NETWORK', message: 'late' });
    const wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    expect(wrap.textContent).toBe('Hello');
    expect(wrap.getAttribute('data-ega-error')).toBeNull();
  });

  it('unwrappable range (crosses element boundary) returns false from openInline', () => {
    document.body.innerHTML = '<p><b>hel</b>lo</p>';
    const r = document.createRange();
    const b = document.querySelector('b');
    const p = document.querySelector('p');
    invariant(b && p, 'test setup: b and p must exist');
    r.setStart(firstChildOf(b), 1); // inside <b>
    const after = p.childNodes[1];
    invariant(after, 'test setup: p must have a sibling node');
    r.setEnd(after, 2); // after <b>
    const ok = openInline({ requestId: 'r1', range: r, stuckTimeoutMs: INLINE_STUCK_MS });
    expect(ok).toBe(false);
    expect(inlineCount()).toBe(0);
  });
});

describe('inlineReplace — restoreAllInline ends every in-flight request', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<p id="p">mar7aba, kifak? shu 3am ta3mel?</p><p id="q">yalla ma3ak shi 7elow</p>';
    pending.clear();
    rendererOwner.clear();
  });
  afterEach(() => {
    setStopStreamHook(null);
    restoreAllInline();
    document.body.innerHTML = '';
  });

  it('stops the stream of every active wrapper when Esc restores', () => {
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(byId('p')), 0, textLen(byId('p'))),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    openInline({
      requestId: 'r2',
      range: rangeOver(firstChildOf(byId('q')), 0, textLen(byId('q'))),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    expect(inlineCount()).toBe(2);

    const seen: string[] = [];
    setStopStreamHook((id) => seen.push(id));
    restoreAllInline();

    expect(seen.sort()).toEqual(['r1', 'r2']);
    expect(inlineCount()).toBe(0);
    expect(rendererOwner.size).toBe(0);
  });

  it('a settled span drops its request rows and owes no cancel', () => {
    pending.set('r1', { id: 'r1' } as unknown as PendingReq);
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(byId('p')), 0, textLen(byId('p'))),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{"translation":"Done"}');
    finishInline('r1');

    expect(pending.has('r1')).toBe(false);
    expect(rendererOwner.has('r1')).toBe(false);
    const seen: string[] = [];
    setStopStreamHook((id) => seen.push(id));
    restoreAllInline();
    expect(seen).toEqual([]);
  });

  it('restores with no stop hook registered', () => {
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(byId('p')), 0, textLen(byId('p'))),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    restoreAllInline();
    expect(inlineCount()).toBe(0);
  });
});

describe('inlineReplace — Escape reverts settled wrappers too', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<p id="p">mar7aba, kifak? shu 3am ta3mel?</p><p id="q">yalla ma3ak shi 7elow</p>';
  });
  afterEach(() => {
    setStopStreamHook(null);
    restoreAllInline();
    document.body.innerHTML = '';
  });

  it('restoreAllInline reverts a completed (finished) entry to its original text', () => {
    const p = byId('p');
    const original = p.textContent;
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, original.length),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{"translation":"مرحبا"}');
    finishInline('r1', { confidence: 0.9 });

    restoreAllInline();

    expect(document.querySelector('[data-ega-replaced="r1"]')).toBeNull();
    expect(p.textContent).toBe(original);
  });

  it('restoreAllInline reverts pending and finished entries alike', () => {
    const p = byId('p');
    const q = byId('q');
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, textLen(p)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    openInline({
      requestId: 'r2',
      range: rangeOver(firstChildOf(q), 0, textLen(q)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });

    appendInlineDelta('r1', '{"translation":"Done"}');
    finishInline('r1', { confidence: 0.9 });

    restoreAllInline();

    expect(document.querySelector('[data-ega-replaced="r1"]')).toBeNull();
    expect(document.querySelector('[data-ega-replaced="r2"]')).toBeNull();
  });

  it('a single Escape with only settled translations does NOT revert them', () => {
    const p = byId('p');
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, textLen(p)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{"translation":"Hello"}');
    finishInline('r1', { confidence: 0.9 });
    expect(inlineCount()).toBe(0);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // Esc is overloaded page-wide — one stray press must not nuke settled text.
    expect(document.querySelector('[data-ega-replaced="r1"]')).not.toBeNull();
    expect(p.textContent).toBe('Hello');
  });

  it('a double Escape within the window reverts settled translations (listener stays armed)', () => {
    const p = byId('p');
    const original = p.textContent;
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, original.length),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{"translation":"Hello"}');
    finishInline('r1', { confidence: 0.9 });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelector('[data-ega-replaced="r1"]')).toBeNull();
    expect(p.textContent).toBe(original);
  });

  it('Escape with the pointer over a wrapper reverts settled translations at once', () => {
    const p = byId('p');
    const original = p.textContent;
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, original.length),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{"translation":"Hello"}');
    finishInline('r1', { confidence: 0.9 });

    const wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    wrap.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelector('[data-ega-replaced="r1"]')).toBeNull();
    expect(p.textContent).toBe(original);
  });

  it('a page-translate wrapper under the pointer does not arm the single-Esc revert', () => {
    const p = byId('p');
    const q = byId('q');
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, textLen(p)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{"translation":"Hello"}');
    finishInline('r1', { confidence: 0.9 });

    // Page translate marks its blocks with data-ega-replaced too, but never data-ega-original.
    q.innerHTML = '<span data-ega-replaced="b-1" id="pt">translated block</span>';
    byId('pt').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelector('[data-ega-replaced="r1"]')).not.toBeNull();
  });

  it('moving the pointer off the wrapper re-arms the single-Esc guard', () => {
    const p = byId('p');
    const q = byId('q');
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, textLen(p)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{"translation":"Hello"}');
    finishInline('r1', { confidence: 0.9 });

    const wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    wrap.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    q.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelector('[data-ega-replaced="r1"]')).not.toBeNull();
  });

  it('no cancel goes out for completed entries during restoreAllInline', () => {
    const p = byId('p');
    const q = byId('q');
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, textLen(p)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    openInline({
      requestId: 'r2',
      range: rangeOver(firstChildOf(q), 0, textLen(q)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{"translation":"Done"}');
    finishInline('r1', { confidence: 0.9 });

    const seen: string[] = [];
    setStopStreamHook((id) => seen.push(id));
    restoreAllInline();

    expect(seen).toEqual(['r2']);
  });
});

describe('inlineReplace — a completed entry releases the original fragment', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="p">mar7aba, kifak? shu 3am ta3mel?</p>';
  });
  afterEach(() => {
    restoreAllInline();
    document.body.innerHTML = '';
  });

  it('after finishInline the entry no longer holds the original DocumentFragment nodes', () => {
    const p = byId('p');
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, textLen(p)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{"translation":"مرحبا"}');
    finishInline('r1', { confidence: 0.9 });

    const wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    expect(wrap.textContent).toBe('مرحبا');
    // Peek-hold reads the stored originalText, not the released DOM clone.
    wrap.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(wrap.textContent).toBe('mar7aba, kifak? shu 3am ta3mel?');
    wrap.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(wrap.textContent).toBe('مرحبا');
  });
});

describe('inlineReplace — settled translates leave no tracking entry', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="p">mar7aba, kifak? shu 3am ta3mel?</p>';
  });
  afterEach(() => {
    restoreAllInline();
    document.body.innerHTML = '';
  });

  it('finishInline drops the entry while keeping the wrapper and its peek-hold', () => {
    const p = byId('p');
    const original = p.textContent;
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, original.length),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    appendInlineDelta('r1', '{"translation":"Hello"}');
    finishInline('r1', { confidence: 0.9 });

    expect(inlineCount()).toBe(0);
    const wrap = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    expect(wrap.textContent).toBe('Hello');
    wrap.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(wrap.textContent).toBe(original);
    wrap.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(wrap.textContent).toBe('Hello');
  });

  it('errorInline drops the entry', () => {
    const p = byId('p');
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, textLen(p)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    errorInline('r1', { code: 'NETWORK', message: 'offline' });
    expect(inlineCount()).toBe(0);
    expect(document.querySelector('[data-ega-replaced="r1"]')).not.toBeNull();
  });
});

describe('restoreInline — calling it twice is safe', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="p">hello world</p><p id="q">second</p>';
  });

  afterEach(() => {
    restoreAllInline();
    document.body.innerHTML = '';
  });

  it('concurrent restoreInline + restoreAllInline does not double-fire replaceWith', () => {
    const p = byId('p');
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, textLen(p)),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    const wrapper = document.querySelector('[data-ega-replaced="r1"]') as HTMLElement;
    const replaceWithSpy = vi.spyOn(wrapper, 'replaceWith');

    restoreInline('r1');
    restoreAllInline();

    expect(replaceWithSpy).toHaveBeenCalledTimes(1);
  });

  it('calling restoreInline twice only restores once', () => {
    const p = byId('p');
    const original = p.textContent;
    openInline({
      requestId: 'r1',
      range: rangeOver(firstChildOf(p), 0, original.length),
      stuckTimeoutMs: INLINE_STUCK_MS,
    });
    restoreInline('r1');
    expect(p.textContent).toBe(original);
    expect(() => restoreInline('r1')).not.toThrow();
    expect(p.textContent).toBe(original);
    expect(inlineCount()).toBe(0);
  });
});
