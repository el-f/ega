// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { drainAsync } from '@tests/_helpers/async';

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SidePanel — onMount listener leak on fast open→close', () => {
  it('registers no deferred listeners when destroyed during the onMount awaits', async () => {
    const onChangedAdd = vi.spyOn(chrome.storage.onChanged, 'addListener');
    const windowAdd = vi.spyOn(window, 'addEventListener');

    // Unmount before onMount's awaits resolve.
    const { unmount } = render(SidePanel);
    unmount();

    // Without the destroyed guard the deferred listeners register after onDestroy and leak.
    await drainAsync();

    expect(onChangedAdd).not.toHaveBeenCalled();
    const pagehideCalls = windowAdd.mock.calls.filter(([type]) => type === 'pagehide');
    expect(pagehideCalls).toHaveLength(0);
  });
});
