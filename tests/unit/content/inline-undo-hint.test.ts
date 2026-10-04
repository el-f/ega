// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

const STUCK_MS = 90_000;

function toast(): HTMLElement | null {
  const root = document.getElementById('ega-shadow-host')?.shadowRoot;
  return root?.querySelector<HTMLElement>('.ega-toast') ?? null;
}

async function translateInPlace(settings: Settings): Promise<void> {
  vi.resetModules();
  const { setSettings } = await import('@/content/settings-cache');
  setSettings(settings);
  const inline = await import('@/content/inlineReplace');
  const p = document.getElementById('p') as HTMLElement;
  const range = document.createRange();
  range.selectNodeContents(p);
  inline.openInline({ requestId: 'r1', range, stuckTimeoutMs: STUCK_MS });
  inline.appendInlineDelta('r1', '{"translation":"Hello there"}');
  inline.finishInline('r1');
}

beforeEach(() => {
  document.body.innerHTML = '<p id="p">mar7aba ya 5ayye</p>';
});

afterEach(async () => {
  const { dismissToast } = await import('@/content/toast');
  dismissToast();
  document.getElementById('ega-shadow-host')?.remove();
});

describe('inline replace — the first replace says how to undo it', () => {
  it('shows a toast naming Esc, with an Undo button that puts the original back', async () => {
    const send = vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    await translateInPlace({ ...DEFAULT_SETTINGS, inlineUndoHintShown: false });

    expect(document.getElementById('p')?.textContent).toBe('Hello there');
    expect(toast()?.textContent).toContain('Press Esc twice');
    expect(send).toHaveBeenCalledWith({
      kind: 'settings:update',
      patch: { inlineUndoHintShown: true },
    });

    toast()?.querySelector<HTMLButtonElement>('[data-ega-toast-action]')?.click();
    expect(document.getElementById('p')?.textContent).toBe('mar7aba ya 5ayye');
    expect(document.querySelector('[data-ega-replaced]')).toBeNull();
  });

  it('stays quiet once the hint was shown', async () => {
    await translateInPlace({ ...DEFAULT_SETTINGS, inlineUndoHintShown: true });
    expect(document.getElementById('p')?.textContent).toBe('Hello there');
    expect(toast()).toBeNull();
  });
});
