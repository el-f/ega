// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { saveThread, GENERAL_ORIGIN } from '@/sidepanel/state/conversation-store';
import type { Turn } from '@/sidepanel/state/conversation';
import { drainAsync } from '@tests/_helpers/async';

// The toast lasts 8 seconds; the banner is what tells the user hours later that nothing is being kept.

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function storedTurn(id: string, content: string): Turn {
  return { id, role: 'user', kind: 'translate', status: 'idle', createdAt: 1, content };
}

function banner(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-ega-save-failed]');
}

function failEveryThreadWrite(): void {
  const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  vi.spyOn(chrome.storage.local, 'set').mockImplementation((items) => {
    const record = items as Record<string, unknown>;
    if (Object.keys(record).some((k) => k.startsWith('ega:conv:'))) {
      return Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
    }
    return originalSet(record);
  });
}

describe('a conversation that stopped being saved says so until it is saved', () => {
  it('shows the banner after a real failed save, keeps it on a failed Try again, and clears it on a good one', async () => {
    await saveThread(GENERAL_ORIGIN, [storedTurn('u1', 'kept text')]);
    const { container } = render(SidePanel);
    await drainAsync();
    expect(banner(container)).toBeNull();

    failEveryThreadWrite();
    // The pagehide flush is the real producer of the failure — no flag is set by hand.
    window.dispatchEvent(new Event('pagehide'));
    await drainAsync();
    expect(banner(container)).not.toBeNull();

    const retry = container.querySelector<HTMLButtonElement>('[data-ega-save-failed-retry]');
    if (!retry) throw new Error('Try again button missing');
    await fireEvent.click(retry);
    await drainAsync();
    expect(banner(container), 'still failing, so the banner stays').not.toBeNull();

    vi.restoreAllMocks();
    await fireEvent.click(retry);
    await drainAsync();
    expect(banner(container)).toBeNull();
  });
});
