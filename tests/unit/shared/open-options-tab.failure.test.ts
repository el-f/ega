import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openOptionsTab } from '@/shared/open-options-tab';
import { toastStore } from '@/shared/components/toastStore';
import { flushAsync } from '@tests/_helpers/async';

vi.mock('@/shared/components/toastStore', () => ({ toastStore: { push: vi.fn() } }));

const push = vi.mocked(toastStore.push);
// restoreAllMocks would strip the shared chrome mock, so the reject is set per test.
const openOptionsPage = vi.mocked(chrome.runtime.openOptionsPage);

beforeEach(() => {
  push.mockClear();
  openOptionsPage.mockReset();
});

describe('openOptionsTab', () => {
  it('says how to reach Settings by hand when Chrome refuses to open the page', async () => {
    openOptionsPage.mockRejectedValue(new Error('no options page'));
    openOptionsTab();
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push.mock.calls[0]?.[0].message).toMatch(/chrome:\/\/extensions/);
    expect(push.mock.calls[0]?.[0].variant).toBe('danger');
  });

  it('stays quiet on the success path', async () => {
    openOptionsPage.mockResolvedValue(undefined);
    openOptionsTab();
    await vi.waitFor(() => expect(openOptionsPage).toHaveBeenCalled());
    // The failure toast follows the rejected open in the same chain, so one flush would show it.
    await flushAsync();
    expect(push).not.toHaveBeenCalled();
  });
});
