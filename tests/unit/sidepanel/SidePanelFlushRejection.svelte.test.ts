// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { drainAsync } from '@tests/_helpers/async';

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function captureRejections(): { seen: unknown[]; stop: () => void } {
  const seen: unknown[] = [];
  const onRejection = (reason: unknown): void => {
    seen.push(reason);
  };
  process.on('unhandledRejection', onRejection);
  return {
    seen,
    stop: () => process.off('unhandledRejection', onRejection),
  };
}

describe('SidePanel — a save that fails on the way out stays handled', () => {
  it('pagehide does not raise an unhandled rejection when storage is full', async () => {
    render(SidePanel);
    await drainAsync();
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValue(
      new Error('QUOTA_BYTES quota exceeded'),
    );

    const captured = captureRejections();
    window.dispatchEvent(new Event('pagehide'));
    await drainAsync();
    captured.stop();

    expect(captured.seen).toEqual([]);
  });

  it('closing the panel does not raise an unhandled rejection when storage is full', async () => {
    const { unmount } = render(SidePanel);
    await drainAsync();
    vi.spyOn(chrome.storage.local, 'set').mockRejectedValue(
      new Error('QUOTA_BYTES quota exceeded'),
    );

    const captured = captureRejections();
    unmount();
    await drainAsync();
    captured.stop();

    expect(captured.seen).toEqual([]);
  });
});
