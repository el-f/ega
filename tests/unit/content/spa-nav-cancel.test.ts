// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
const nativePushState = history.pushState;
await import('@/content/index');
import { beginRequest, pending, rendererOwner } from '@/content/request-state';
import { sel } from '@tests/_helpers/lang';

function makeReq(id: string) {
  const auto = sel('auto');
  const en = sel('en');
  return {
    id,
    text: 'hello',
    rect: {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    } as DOMRect,
    sourceLang: auto,
    direction: { source: auto, target: en },
  };
}

beforeEach(() => {
  pending.clear();
  rendererOwner.clear();
  (chrome.runtime.sendMessage as Mock).mockReset();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

describe('T9 — SPA navigation cancels active tooltip translates', () => {
  it('popstate fires translate:cancel for active tooltip entry', async () => {
    pending.set('r-spa-1', makeReq('r-spa-1'));
    beginRequest('r-spa-1', 'tooltip');

    window.dispatchEvent(new PopStateEvent('popstate'));
    await Promise.resolve();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'translate:cancel', requestId: 'r-spa-1' }),
    );
  });

  it('hashchange fires translate:cancel for active tooltip entry', async () => {
    pending.set('r-spa-2', makeReq('r-spa-2'));
    beginRequest('r-spa-2', 'tooltip');

    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await Promise.resolve();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'translate:cancel', requestId: 'r-spa-2' }),
    );
  });

  // An SPA route change tears out the node an inline wrapper is anchored to, so its stream must stop too.
  it('SPA nav cancels an in-flight inline entry', async () => {
    const sendSpy = chrome.runtime.sendMessage as Mock;
    sendSpy.mockReset();
    sendSpy.mockResolvedValue({ ok: true });

    pending.set('r-inline-1', makeReq('r-inline-1'));
    beginRequest('r-inline-1', 'inline');

    window.dispatchEvent(new PopStateEvent('popstate'));
    // The inline branch awaits a dynamic import; leaving it in flight throws after teardown.
    await vi.waitFor(() => {
      expect(rendererOwner.has('r-inline-1')).toBe(false);
    });

    const cancelCalls = sendSpy.mock.calls.filter(
      (c: unknown[]) => (c[0] as { requestId?: string }).requestId === 'r-inline-1',
    );
    expect(cancelCalls).toHaveLength(1);
  });

  it('page-v2 owns its own watcher, so a nav does not cancel its blocks twice', async () => {
    const sendSpy = chrome.runtime.sendMessage as Mock;
    sendSpy.mockReset();
    sendSpy.mockResolvedValue({ ok: true });

    pending.set('r-page-1', makeReq('r-page-1'));
    beginRequest('r-page-1', 'page-v2');

    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((r) => setTimeout(r, 0));

    const cancelCalls = sendSpy.mock.calls.filter(
      (c: unknown[]) => (c[0] as { requestId?: string }).requestId === 'r-page-1',
    );
    expect(cancelCalls).toHaveLength(0);
  });

  // An isolated-world patch on `history` is invisible to the page's own router; jsdom shares one world and would pass it.
  it('a router pushState is invisible to the content script', async () => {
    const sendSpy = chrome.runtime.sendMessage as Mock;
    sendSpy.mockReset();
    sendSpy.mockResolvedValue({ ok: true });

    pending.set('r-push-1', makeReq('r-push-1'));
    beginRequest('r-push-1', 'tooltip');

    history.pushState(null, '', '/another-article');
    await new Promise((r) => setTimeout(r, 0));

    expect(sendSpy.mock.calls).toHaveLength(0);
    expect(history.pushState).toBe(nativePushState);
    history.pushState(null, '', '/');
  });
});
