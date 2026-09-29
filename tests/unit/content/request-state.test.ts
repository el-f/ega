// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  beginRequest,
  endRequest,
  pending,
  perfTimers,
  releaseRequest,
  rendererFor,
  rendererOwner,
  setRenderer,
  setStopStreamHook,
  settleStream,
  stopRequestStream,
  type PendingReq,
  type Renderer,
} from '@/content/request-state';
import { sel } from '@tests/_helpers/lang';

function makeReq(id: string): PendingReq {
  const auto = sel('auto');
  const en = sel('en');
  return {
    id,
    text: 'hello',
    rect: new DOMRect(0, 0, 10, 10),
    sourceLang: auto,
    direction: { source: auto, target: en },
  };
}

function fakeRenderer(): Renderer & { dispose: Mock<(requestId: string) => void> } {
  return { append: vi.fn(), finish: vi.fn(), error: vi.fn(), dispose: vi.fn() };
}

const stopped: string[] = [];

beforeEach(() => {
  stopped.length = 0;
  setStopStreamHook((id) => stopped.push(id));
  pending.clear();
  rendererOwner.clear();
  perfTimers.clear();
});

afterEach(() => {
  setStopStreamHook(null);
});

describe('endRequest — one exit for a live request', () => {
  it('cancels the stream once and clears every row', () => {
    const tooltip = fakeRenderer();
    setRenderer('tooltip', tooltip);
    beginRequest('a', 'tooltip');
    pending.set('a', makeReq('a'));
    perfTimers.set('a', { startedAt: 0, firstDelta: null });

    endRequest('a', 'close');

    expect(stopped).toEqual(['a']);
    expect(pending.has('a')).toBe(false);
    expect(rendererOwner.has('a')).toBe(false);
    expect(perfTimers.has('a')).toBe(false);
    expect(tooltip.dispose).toHaveBeenCalledWith('a');
  });

  it('a second end sends no second cancel and disposes nothing', () => {
    const tooltip = fakeRenderer();
    setRenderer('tooltip', tooltip);
    beginRequest('a', 'tooltip');

    endRequest('a', 'superseded');
    endRequest('a', 'close');

    expect(stopped).toEqual(['a']);
    expect(tooltip.dispose).toHaveBeenCalledTimes(1);
  });

  it('sends no cancel for a request whose stream already settled', () => {
    setRenderer('tooltip', fakeRenderer());
    beginRequest('a', 'tooltip');
    settleStream('a');

    endRequest('a', 'close');

    expect(stopped).toEqual([]);
    expect(rendererOwner.has('a')).toBe(false);
  });

  it('a stuck guard that stopped the stream leaves nothing for the close to cancel', () => {
    setRenderer('tooltip', fakeRenderer());
    beginRequest('a', 'tooltip');

    stopRequestStream('a');
    endRequest('a', 'close');

    expect(stopped).toEqual(['a']);
  });

  it('cancels before it disposes, so the worker stops streaming into a surface being torn down', () => {
    const order: string[] = [];
    setStopStreamHook((id) => order.push(`cancel:${id}`));
    setRenderer('inline', {
      append: vi.fn(),
      finish: vi.fn(),
      error: vi.fn(),
      dispose: (id) => order.push(`dispose:${id}`),
    });
    beginRequest('i', 'inline');

    endRequest('i', 'nav');

    expect(order).toEqual(['cancel:i', 'dispose:i']);
  });

  it('dispatches dispose to the renderer that owns the request', () => {
    const tooltip = fakeRenderer();
    const inline = fakeRenderer();
    setRenderer('tooltip', tooltip);
    setRenderer('inline', inline);
    beginRequest('i', 'inline');

    endRequest('i', 'esc');

    expect(inline.dispose).toHaveBeenCalledWith('i');
    expect(tooltip.dispose).not.toHaveBeenCalled();
  });
});

describe('releaseRequest — rows go, the surface stays', () => {
  it('drops the rows, sends no cancel and disposes nothing', () => {
    const inline = fakeRenderer();
    setRenderer('inline', inline);
    beginRequest('i', 'inline');
    pending.set('i', makeReq('i'));

    releaseRequest('i');

    expect(stopped).toEqual([]);
    expect(inline.dispose).not.toHaveBeenCalled();
    expect(pending.has('i')).toBe(false);
    expect(rendererOwner.has('i')).toBe(false);
    // The stream is settled too: an end after a release owes no cancel.
    endRequest('i', 'nav');
    expect(stopped).toEqual([]);
  });
});

describe('rendererFor', () => {
  it('falls back to the tooltip for an unregistered id', () => {
    const tooltip = fakeRenderer();
    setRenderer('tooltip', tooltip);
    expect(rendererFor('nobody')).toBe(tooltip);
  });

  it('returns the owner registered for the request', () => {
    const inline = fakeRenderer();
    setRenderer('inline', inline);
    beginRequest('i', 'inline');
    expect(rendererFor('i')).toBe(inline);
  });
});
