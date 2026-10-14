// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openTooltip, closeTooltip } from '@/content/tipState.svelte';
import { mountShadowHost } from '@/content/shadowHost';
import { pending, rendererOwner, perfTimers, type PendingReq } from '@/content/request-state';
import { sel } from '@tests/_helpers/lang';

function rect(x: number, y: number, w: number, h: number): DOMRect {
  return {
    x,
    y,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
    width: w,
    height: h,
    toJSON: () => ({}),
  } as DOMRect;
}

function makeReq(id: string): PendingReq {
  const auto = sel('auto');
  const en = sel('en');
  return {
    id,
    text: 'hello',
    rect: rect(0, 0, 10, 10),
    sourceLang: auto,
    direction: { source: auto, target: en },
  };
}

function track(id: string, owner: 'tooltip' | 'inline'): void {
  pending.set(id, makeReq(id));
  rendererOwner.set(id, owner);
  perfTimers.set(id, { startedAt: 0, firstDelta: null });
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-ega-host-installed');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
  pending.clear();
  rendererOwner.clear();
  perfTimers.clear();
  mountShadowHost();
});

afterEach(() => {
  closeTooltip();
  pending.clear();
  rendererOwner.clear();
  perfTimers.clear();
  document.body.innerHTML = '';
});

describe('a replaced tooltip releases its request', () => {
  it('drops the superseded request from every request map', () => {
    track('a', 'tooltip');
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });

    openTooltip({ requestId: 'b', srcText: 'bye', rect: rect(60, 60, 100, 20) });

    expect(pending.has('a')).toBe(false);
    expect(rendererOwner.has('a')).toBe(false);
    expect(perfTimers.has('a')).toBe(false);
  });

  it('keeps the request the new tooltip belongs to', () => {
    track('a', 'tooltip');
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });
    track('b', 'tooltip');

    openTooltip({ requestId: 'b', srcText: 'bye', rect: rect(60, 60, 100, 20) });

    expect(pending.has('b')).toBe(true);
    expect(rendererOwner.get('b')).toBe('tooltip');
  });

  it('leaves an inline request running', () => {
    track('i', 'inline');
    track('a', 'tooltip');
    openTooltip({ requestId: 'a', srcText: 'hi', rect: rect(50, 50, 100, 20) });

    openTooltip({ requestId: 'b', srcText: 'bye', rect: rect(60, 60, 100, 20) });

    expect(pending.has('i')).toBe(true);
    expect(rendererOwner.get('i')).toBe('inline');
  });
});
