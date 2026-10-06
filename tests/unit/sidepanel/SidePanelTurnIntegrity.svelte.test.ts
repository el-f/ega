// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { PENDING_POPUP_HANDOFF_KEY } from '@/shared/pending-popup-handoff';
import { chromeMock } from '@tests/mocks/chrome';
import { toastStore } from '@/shared/components/toastStore';
import { GENERAL_ORIGIN, loadThreadResult } from '@/sidepanel/state/conversation-store';
import { openMenu } from './_reply';

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  (chrome.runtime.sendMessage as Mock).mockClear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
  await chromeMock.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, contextEnabled: true },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  (chromeMock.tabs.query as Mock).mockResolvedValue([]);
  (chromeMock.tabs.sendMessage as Mock).mockResolvedValue({ ok: true });
});

async function drainAsync(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** Queues a finished tooltip answer, which the panel lands as a terminal turn pair. */
async function queueDeliveredHandoff(sourceText: string): Promise<void> {
  await chromeMock.storage.session.set({
    [PENDING_POPUP_HANDOFF_KEY]: {
      '1-1': {
        sourceText,
        sourceLang: 'auto',
        targetLang: 'en',
        task: 'translate',
        tone: 'neutral',
        ts: Date.now(),
        response: 'answer',
      },
    },
  });
}

function starts(): Array<Record<string, unknown>> {
  return (chrome.runtime.sendMessage as Mock).mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((m) => m['kind'] === 'translate:start');
}

describe('deleting a turn', () => {
  it('offers Undo and puts the exchange back', async () => {
    const push = vi.spyOn(toastStore, 'push');
    await queueDeliveredHandoff('delete me');
    const { container } = render(SidePanel);
    await drainAsync();
    expect(container.querySelectorAll('[data-turn-id]').length).toBe(2);

    await openMenu(container, 'more');
    document.querySelector<HTMLElement>('[data-ega-delete]')?.click();
    await drainAsync();
    expect(container.querySelectorAll('[data-turn-id]').length).toBe(0);

    const undo = push.mock.calls.map((c) => c[0]).find((m) => m.action?.label === 'Undo');
    expect(undo).toBeDefined();
    undo?.action?.onClick();
    await drainAsync();

    expect(container.querySelectorAll('[data-turn-id]').length).toBe(2);
    // The panel follows no tab here, so the thread is the general bucket.
    expect((await loadThreadResult(GENERAL_ORIGIN)).turns).toHaveLength(2);
    // Two full panel renders per case: ~3s alone, more when the suite runs in parallel.
  }, 15000);

  it('drops the focus ring with the turn, so Undo does not bring it back', async () => {
    const push = vi.spyOn(toastStore, 'push');
    await queueDeliveredHandoff('focus me');
    const { container } = render(SidePanel);
    await drainAsync();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
    await drainAsync();
    expect(container.querySelectorAll('.focused')).toHaveLength(1);

    await openMenu(container, 'more');
    document.querySelector<HTMLElement>('[data-ega-delete]')?.click();
    await drainAsync();
    push.mock.calls
      .map((c) => c[0])
      .find((m) => m.action?.label === 'Undo')
      ?.action?.onClick();
    await drainAsync();

    expect(container.querySelectorAll('[data-turn-id]')).toHaveLength(2);
    expect(container.querySelectorAll('.focused')).toHaveLength(0);
  }, 15000);
});

describe('a failure another surface reported', () => {
  it('is toasted when it came from a content script', async () => {
    const push = vi.spyOn(toastStore, 'push');
    render(SidePanel);
    await drainAsync();

    chromeMock.runtime.onMessage.emit(
      {
        kind: 'audit:append',
        entry: { error: { code: 'NETWORK', message: 'dropped' }, surface: 'content' },
      },
      { id: chrome.runtime.id } as chrome.runtime.MessageSender,
      () => {},
    );
    await drainAsync();

    expect(push.mock.calls.some((c) => c[0].message.includes('dropped'))).toBe(true);
  });

  it('is not toasted when a sibling side panel owns it', async () => {
    const push = vi.spyOn(toastStore, 'push');
    render(SidePanel);
    await drainAsync();

    chromeMock.runtime.onMessage.emit(
      {
        kind: 'audit:append',
        entry: { error: { code: 'NETWORK', message: 'dropped' }, surface: 'sidepanel' },
      },
      { id: chrome.runtime.id } as chrome.runtime.MessageSender,
      () => {},
    );
    await drainAsync();

    expect(push.mock.calls.some((c) => c[0].message.includes('dropped'))).toBe(false);
  });
});

describe('a translate handed off from the popup', () => {
  it('ships the same page context a typed message does', async () => {
    (chromeMock.tabs.query as Mock).mockResolvedValue([{ id: 7 }]);
    (chromeMock.tabs.sendMessage as Mock).mockResolvedValue({
      context: { title: 'Doc title', url: 'https://example.com/a' },
    });

    await chromeMock.storage.session.set({
      [PENDING_POPUP_HANDOFF_KEY]: {
        '1-1': {
          sourceText: 'hola',
          sourceLang: 'auto',
          targetLang: 'en',
          task: 'translate',
          tone: 'neutral',
          ts: Date.now(),
        },
      },
    });
    render(SidePanel);
    await drainAsync();

    expect(starts()[0]?.['context']).toEqual({
      title: 'Doc title',
      url: 'https://example.com/a',
    });
  });
});
