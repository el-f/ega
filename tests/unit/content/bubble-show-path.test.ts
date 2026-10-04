// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { resetSettingsCacheForTest } from '@/content/settings-cache';
import { peekContainer } from '@/content/shadowHost';
import { hideBubble } from '@/content/bubble';
import type { Settings } from '@/shared/types';

await import('@/content/index');

function seed(patch: Partial<Settings>): Promise<void> {
  resetSettingsCacheForTest();
  return chromeMock.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, bubbleMode: 'always', ...patch },
  });
}

function selectWord(): void {
  document.body.innerHTML = '<article id="art">alpha beta gamma delta</article>';
  const first = document.getElementById('art')?.firstChild;
  if (!first) throw new Error('article text node missing');
  const r = document.createRange();
  r.setStart(first, 6);
  r.setEnd(first, 10);
  const s = window.getSelection();
  if (!s) throw new Error('no selection API');
  s.removeAllRanges();
  s.addRange(r);
  document.dispatchEvent(new Event('selectionchange'));
}

async function mountedBubble(): Promise<HTMLElement> {
  return vi.waitFor(() => {
    const b = peekContainer()?.querySelector<HTMLElement>('.bubble');
    if (!b) throw new Error('no bubble yet');
    return b;
  });
}

function firstRunPatches(): unknown[] {
  return (chromeMock.runtime.sendMessage as Mock).mock.calls
    .map((c) => c[0] as { kind?: string; patch?: unknown })
    .filter((m) => m.kind === 'settings:update')
    .map((m) => m.patch);
}

beforeEach(() => {
  (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
  (chromeMock.runtime.sendMessage as Mock).mockClear();
  // jsdom has no hit testing; the bubble's line probe reads it.
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [];
});

afterEach(() => {
  hideBubble();
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
  localStorage.removeItem('ega-debug');
  vi.restoreAllMocks();
});

describe('the selection bubble show path', () => {
  it('plays the first-run pulse once and stores that it was seen', async () => {
    await seed({ bubbleFirstRunSeen: false });
    selectWord();
    expect((await mountedBubble()).classList.contains('is-first-run')).toBe(true);
    expect(firstRunPatches()).toEqual([{ bubbleFirstRunSeen: true }]);

    hideBubble();
    (chromeMock.runtime.sendMessage as Mock).mockClear();
    await seed({ bubbleFirstRunSeen: true });
    selectWord();
    expect((await mountedBubble()).classList.contains('is-first-run')).toBe(false);
    expect(firstRunPatches()).toEqual([]);
  });

  it('stores the first-run flag once across selections made before the settings re-read lands', async () => {
    await seed({ bubbleFirstRunSeen: false });
    selectWord();
    expect((await mountedBubble()).classList.contains('is-first-run')).toBe(true);

    hideBubble();
    selectWord();
    expect((await mountedBubble()).classList.contains('is-first-run')).toBe(true);
    expect(firstRunPatches()).toEqual([{ bubbleFirstRunSeen: true }]);
  });

  it('sends the first-run flag again on the next selection when the first send failed', async () => {
    const send = chromeMock.runtime.sendMessage as Mock;
    let failed = false;
    send.mockImplementation((msg: { kind?: string }, ...rest: unknown[]) => {
      if (msg.kind === 'settings:update' && !failed) {
        failed = true;
        return Promise.reject(new Error('worker restarting'));
      }
      return (workerReply as (...a: unknown[]) => unknown)(msg, ...rest);
    });
    await seed({ bubbleFirstRunSeen: false });
    selectWord();
    await mountedBubble();
    await vi.waitFor(() => expect(failed).toBe(true));
    await Promise.resolve();

    hideBubble();
    selectWord();
    await mountedBubble();
    expect(firstRunPatches()).toEqual([{ bubbleFirstRunSeen: true }, { bubbleFirstRunSeen: true }]);
  });

  it('logs why the bubble showed when the debug flag is on', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    localStorage.setItem('ega-debug', '1');
    await seed({ bubbleFirstRunSeen: true });
    selectWord();
    await mountedBubble();
    expect(debug).toHaveBeenCalledWith('[ega] bubble shown:', true, 'mode-always', 'beta');
  });

  it('stays quiet about the show path without the debug flag', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    await seed({ bubbleFirstRunSeen: true });
    selectWord();
    await mountedBubble();
    expect(debug.mock.calls.filter((c) => String(c[0]).includes('bubble'))).toEqual([]);
  });
});
