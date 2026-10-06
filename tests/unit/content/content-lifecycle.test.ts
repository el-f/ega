// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  openInline,
  appendInlineDelta,
  finishInline,
  errorInline,
  restoreInline,
  restoreAllInline,
  teardownInline,
  inlineCount,
} from '@/content/inlineReplace';
import { joinCapped } from '@/content/accumulator';
import { mountShadowHost, getContainer, getShadowRoot } from '@/content/shadowHost';
import { showBatchProgress, isBatchProgressActive } from '@/content/batch-progress';
import { showBubble, hideBubble } from '@/content/bubble';
import { setStopStreamHook } from '@/content/request-state';

function rangeOverAll(el: HTMLElement): Range {
  const r = document.createRange();
  r.selectNodeContents(el);
  return r;
}

function rect(x: number, y: number): DOMRect {
  return {
    x,
    y,
    left: x,
    top: y,
    right: x + 100,
    bottom: y + 20,
    width: 100,
    height: 20,
    toJSON: () => ({}),
  } as DOMRect;
}

function el(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`test setup: #${id} missing`);
  return found;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.querySelectorAll('#ega-shadow-host').forEach((n) => n.remove());
  document.documentElement.removeAttribute('data-ega-host-installed');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
  // jsdom has no hit testing; the bubble's line probe reads it.
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [];
  mountShadowHost();
});

afterEach(() => {
  restoreAllInline();
  setStopStreamHook(null);
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('undo of a settled inline replace keeps the markup', () => {
  it('restores links and emphasis instead of flat text', () => {
    document.body.innerHTML = '<p id="p">read <a href="https://x.test">the docs</a> now</p>';
    openInline({ requestId: 'r1', range: rangeOverAll(el('p')), stuckTimeoutMs: 90_000 });
    appendInlineDelta('r1', '{"translation":"lis la doc maintenant"');
    finishInline('r1', { confidence: 1 });
    expect(el('p').querySelector('a')).toBeNull();

    restoreInline('r1');

    const link = el('p').querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://x.test');
    expect(el('p').textContent).toBe('read the docs now');
  });

  it('restores the markup of an errored block too', () => {
    document.body.innerHTML = '<p id="p">see <em id="e">this</em></p>';
    openInline({ requestId: 'r2', range: rangeOverAll(el('p')), stuckTimeoutMs: 90_000 });
    errorInline('r2', { code: 'NETWORK', message: 'gone' });

    restoreInline('r2');

    expect(el('p').querySelector('em')).not.toBeNull();
  });

  it('Esc restore-all brings the markup back for settled wrappers', () => {
    document.body.innerHTML = '<p id="p">alpha <b>beta</b></p>';
    openInline({ requestId: 'r3', range: rangeOverAll(el('p')), stuckTimeoutMs: 90_000 });
    appendInlineDelta('r3', '{"translation":"alpha beta traduit"');
    finishInline('r3', { confidence: 1 });
    expect(el('p').querySelector('b')).toBeNull();

    restoreAllInline();

    expect(el('p').querySelector('b')).not.toBeNull();
  });

  it('a second undo of the same wrapper is a no-op, so the fragment is not held twice', () => {
    document.body.innerHTML = '<p id="p">alpha <b>beta</b></p>';
    openInline({ requestId: 'r4', range: rangeOverAll(el('p')), stuckTimeoutMs: 90_000 });
    appendInlineDelta('r4', '{"translation":"alpha beta traduit"');
    finishInline('r4', { confidence: 1 });

    restoreInline('r4');
    restoreInline('r4');

    expect(el('p').querySelectorAll('b')).toHaveLength(1);
  });
});

describe('teardown unhooks the page', () => {
  it('teardownInline removes the capture-phase Esc listeners and puts in-flight blocks back', () => {
    document.body.innerHTML = '<p id="p">alpha beta</p>';
    openInline({ requestId: 'r5', range: rangeOverAll(el('p')), stuckTimeoutMs: 90_000 });
    const off = vi.spyOn(document, 'removeEventListener');

    teardownInline();

    expect(off.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(['keydown', 'mouseover']),
    );
    expect(inlineCount()).toBe(0);
    expect(el('p').querySelector('[data-ega-replaced]')).toBeNull();
    expect(el('p').textContent).toBe('alpha beta');
  });
});

describe('a queued join says what did not fit', () => {
  it('keeps whole selections and reports the dropped count', () => {
    const parts = ['a'.repeat(900), 'b'.repeat(900), 'c'.repeat(900)];
    const { text, dropped } = joinCapped(parts, 2000);
    expect(dropped).toBe(1);
    expect(text.startsWith('a'.repeat(900))).toBe(true);
    expect(text).not.toContain('c');
    expect(text.length).toBeLessThanOrEqual(2000);
  });

  it('drops nothing when everything fits', () => {
    expect(joinCapped(['one', 'two'], 2000)).toEqual({ text: 'one\n\n---\n\ntwo', dropped: 0 });
  });

  it('still sends a lone over-cap selection, truncated', () => {
    const { text, dropped } = joinCapped(['x'.repeat(3000)], 2000);
    expect(dropped).toBe(0);
    expect(text).toHaveLength(2000);
  });
});

describe('the batch pill is disposed when the host is rebuilt', () => {
  it('a host remount tears the progress toast down', () => {
    showBatchProgress(3, () => {});
    expect(isBatchProgressActive()).toBe(true);

    document.getElementById('ega-shadow-host')?.remove();
    mountShadowHost();

    expect(isBatchProgressActive()).toBe(false);
  });
});

describe('getContainer rebuilds a deleted container', () => {
  it('rebuilds the root div a page script removed from the open shadow root', () => {
    getContainer().remove();
    expect(getShadowRoot().querySelector('[data-ega-root]')).toBeNull();

    const container = getContainer();

    expect(container.isConnected).toBe(true);
    expect(getShadowRoot().querySelector('[data-ega-root]')).toBe(container);
  });
});

describe('the bubble is moved, not remounted, while dragging', () => {
  afterEach(() => {
    hideBubble();
  });

  it('keeps the same button node when only the anchor moved', () => {
    showBubble({ rect: rect(10, 10), queued: 0, onClick: () => {} });
    const first = getContainer().querySelector('.bubble');
    expect(first).not.toBeNull();

    showBubble({ rect: rect(10, 40), queued: 0, onClick: () => {} });

    const second = getContainer().querySelector('.bubble');
    expect(second).toBe(first);
    expect(getContainer().querySelectorAll('[data-ega-bubble-wrap]')).toHaveLength(1);
  });

  it('the moved bubble calls the newest click handler', () => {
    const seen: string[] = [];
    showBubble({ rect: rect(10, 10), queued: 0, onClick: () => seen.push('first') });
    showBubble({ rect: rect(10, 40), queued: 0, onClick: () => seen.push('second') });

    getContainer().querySelector<HTMLElement>('.bubble')?.click();

    expect(seen).toEqual(['second']);
  });

  it('remounts when the queue count changes, so the label is never stale', () => {
    showBubble({ rect: rect(10, 10), queued: 0, onClick: () => {} });
    const first = getContainer().querySelector('.bubble');

    showBubble({ rect: rect(10, 10), queued: 2, onClick: () => {} });

    expect(getContainer().querySelector('.bubble')).not.toBe(first);
    expect(getContainer().querySelector('.bubble')?.textContent.trim()).toBe('Translate 3');
  });
});
