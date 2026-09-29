import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isFromOwnBackground } from '@/shared/messages';

// Contract: `sender.id === chrome.runtime.id` AND no `sender.tab` — only the service worker is tabless.

describe('isFromOwnBackground — content-script security boundary', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      runtime: { id: 'ega-extension-id' },
    });
  });

  function sender(over: Partial<chrome.runtime.MessageSender>): chrome.runtime.MessageSender {
    return { ...over } as chrome.runtime.MessageSender;
  }

  it('accepts messages from own background (same id, no tab)', () => {
    expect(isFromOwnBackground(sender({ id: 'ega-extension-id' }))).toBe(true);
  });

  it('rejects messages from other extensions', () => {
    expect(isFromOwnBackground(sender({ id: 'some-other-extension-id' }))).toBe(false);
  });

  it('rejects messages from a same-extension tab (tab field present)', () => {
    expect(
      isFromOwnBackground(sender({ id: 'ega-extension-id', tab: { id: 42 } as chrome.tabs.Tab })),
    ).toBe(false);
  });

  it('rejects when id is missing entirely (spoof attempt)', () => {
    expect(isFromOwnBackground(sender({}))).toBe(false);
  });

  it('rejects an absent sender (the side panel listener types it optional)', () => {
    expect(isFromOwnBackground(undefined)).toBe(false);
  });

  it('rejects when id matches but tab.id is 0 (falsy but present)', () => {
    // The gate is `tab === undefined`, not truthiness — id 0 is still a tab.
    expect(
      isFromOwnBackground(sender({ id: 'ega-extension-id', tab: { id: 0 } as chrome.tabs.Tab })),
    ).toBe(false);
  });
});
