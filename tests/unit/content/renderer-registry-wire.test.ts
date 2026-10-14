// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@/content/index';
import { openInline, restoreAllInline } from '@/content/inlineReplace';
import { openTooltip, closeTooltip } from '@/content/lazy-tooltip';
// Static so the lazy import inside lazy-tooltip resolves off the warm module graph.
import { getTooltipBody } from '@/content/tipState.svelte';
import { pending, rendererOwner } from '@/content/request-state';
import { mountShadowHost } from '@/content/shadowHost';
import { chromeMock } from '@tests/mocks/chrome';
import type { TranslationChunk } from '@/shared/types';

function deliver(chunk: TranslationChunk): void {
  chromeMock.runtime.onMessage.emit(
    { kind: 'translate:chunk', chunk },
    { id: chromeMock.runtime.id },
    () => {},
  );
}

function rect(): DOMRect {
  return {
    x: 10,
    y: 10,
    left: 10,
    top: 10,
    right: 90,
    bottom: 30,
    width: 80,
    height: 20,
    toJSON: () => ({}),
  } as DOMRect;
}

function rangeOverParagraph(): Range {
  const p = document.getElementById('p') as HTMLElement;
  const text = p.firstChild as Node;
  const r = document.createRange();
  r.setStart(text, 0);
  r.setEnd(text, (text.textContent ?? '').length);
  return r;
}

function inlineWrapper(id: string): HTMLElement | null {
  return document.querySelector(`[data-ega-replaced="${id}"]`);
}

beforeEach(() => {
  document.body.innerHTML = '<p id="p">marhaba kif 7alak</p>';
  document.documentElement.removeAttribute('data-ega-host-installed');
  if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
      StubResizeObserver;
  }
  mountShadowHost();
  pending.clear();
  rendererOwner.clear();
});

afterEach(() => {
  closeTooltip();
  restoreAllInline();
  document.body.innerHTML = '';
});

describe('a chunk off the message path reaches the surface that opened the request', () => {
  it('an inline request streams into its own wrapper', () => {
    expect(
      openInline({ requestId: 'r1', range: rangeOverParagraph(), stuckTimeoutMs: 90_000 }),
    ).toBe(true);

    deliver({ type: 'delta', requestId: 'r1', text: 'hello there' });
    expect(inlineWrapper('r1')?.textContent).toBe('hello there');

    deliver({ type: 'done', requestId: 'r1', confidence: 0.9 });
    expect(inlineWrapper('r1')?.hasAttribute('data-ega-pending')).toBe(false);
    expect(rendererOwner.has('r1')).toBe(false);
  });

  it('an inline request routes its error chunk to the same wrapper', () => {
    openInline({ requestId: 'r2', range: rangeOverParagraph(), stuckTimeoutMs: 90_000 });

    deliver({ type: 'error', requestId: 'r2', code: 'SERVER', message: 'backend said no' });

    expect(inlineWrapper('r2')?.getAttribute('data-ega-error')).toBe('true');
  });

  it('a request nobody claimed streams into the tooltip', async () => {
    openTooltip({ requestId: 't1', srcText: 'marhaba', rect: rect() });

    deliver({ type: 'delta', requestId: 't1', text: 'hello there' });
    deliver({ type: 'done', requestId: 't1', confidence: 0.9 });

    await vi.waitFor(() => expect(getTooltipBody('t1')).toBe('hello there'));
  });
});
