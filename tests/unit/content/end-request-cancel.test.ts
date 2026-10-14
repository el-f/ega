// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
await import('@/content/index');
import {
  beginRequest,
  endRequest,
  pending,
  rendererOwner,
  stopRequestStream,
} from '@/content/request-state';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import type { TranslationChunk } from '@/shared/types';

// Every way a request ends must reach the service worker exactly once, and never after the worker already closed the stream.

function deliver(chunk: TranslationChunk): void {
  chromeMock.runtime.onMessage.emit(
    { kind: 'translate:chunk', chunk },
    { id: chromeMock.runtime.id },
    () => {},
  );
}

function cancelsFor(id: string): number {
  return (chrome.runtime.sendMessage as Mock).mock.calls.filter((c: unknown[]) => {
    const m = c[0] as { kind?: string; requestId?: string };
    return m.kind === 'translate:cancel' && m.requestId === id;
  }).length;
}

beforeEach(() => {
  pending.clear();
  rendererOwner.clear();
  (chrome.runtime.sendMessage as Mock).mockReset();
  (chrome.runtime.sendMessage as Mock).mockImplementation(workerReply);
});

describe('the service worker receives exactly one cancel per ended request', () => {
  it('a request ended mid-stream cancels once', () => {
    beginRequest('a', 'tooltip');
    endRequest('a', 'close');
    expect(cancelsFor('a')).toBe(1);
  });

  it('ending the same request twice still cancels once', () => {
    beginRequest('a', 'tooltip');
    endRequest('a', 'superseded');
    endRequest('a', 'close');
    expect(cancelsFor('a')).toBe(1);
  });

  it('a stuck guard followed by a close cancels once', () => {
    beginRequest('a', 'tooltip');
    stopRequestStream('a');
    endRequest('a', 'close');
    expect(cancelsFor('a')).toBe(1);
  });

  it('a request that finished is never canceled', () => {
    beginRequest('a', 'tooltip');
    deliver({ type: 'delta', requestId: 'a', text: 'hi' });
    deliver({ type: 'done', requestId: 'a', confidence: 1 });
    endRequest('a', 'close');
    expect(cancelsFor('a')).toBe(0);
  });

  it('a request that failed is never canceled', () => {
    beginRequest('a', 'tooltip');
    deliver({ type: 'error', requestId: 'a', code: 'AUTH', message: 'bad key' });
    endRequest('a', 'close');
    expect(cancelsFor('a')).toBe(0);
  });

  it('a nav cancels every live tooltip and inline request once, and finished ones not at all', () => {
    beginRequest('live-tip', 'tooltip');
    beginRequest('live-inline', 'inline');
    beginRequest('done-tip', 'tooltip');
    deliver({ type: 'done', requestId: 'done-tip', confidence: 1 });

    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(cancelsFor('live-tip')).toBe(1);
    expect(cancelsFor('live-inline')).toBe(1);
    expect(cancelsFor('done-tip')).toBe(0);
    expect(rendererOwner.size).toBe(0);
  });
});

describe('a selection translate registers its own tooltip owner', () => {
  it('startTranslateText marks the request as a tooltip, so closing it cancels the worker', async () => {
    const { startTranslateText } = await import('@/content/index');
    const rect = { left: 0, top: 0, right: 10, bottom: 10, x: 0, y: 0, width: 10, height: 10 };
    await startTranslateText('hola mundo', { ...rect, toJSON: () => rect } as DOMRect);

    const start = (chrome.runtime.sendMessage as Mock).mock.calls
      .map((c: unknown[]) => c[0] as { kind?: string; requestId?: string })
      .find((m) => m.kind === 'translate:start');
    const id = start?.requestId ?? '';
    expect(rendererOwner.get(id)).toBe('tooltip');

    endRequest(id, 'close');
    expect(cancelsFor(id)).toBe(1);
  });
});
