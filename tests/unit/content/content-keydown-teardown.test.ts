// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@/content/index';
import { getContainer } from '@/content/shadowHost';
import { setRuntimeId } from '@tests/_helpers/runtime';

function host(): HTMLElement | null {
  return document.getElementById('ega-shadow-host');
}

beforeEach(() => {
  setRuntimeId('ega-test');
});

afterEach(() => {
  setRuntimeId('ega-test');
  vi.restoreAllMocks();
});

describe('content script survives a dead extension context', () => {
  it('a keystroke after the context dies removes the listeners and the shadow host', () => {
    const docOff = vi.spyOn(document, 'removeEventListener');
    // The host is built on first use, so give teardown something to remove.
    getContainer();
    expect(host()).not.toBeNull();
    setRuntimeId(undefined);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));

    expect(docOff.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(['selectionchange', 'keydown']),
    );
    expect(host()).toBeNull();
  });
});
