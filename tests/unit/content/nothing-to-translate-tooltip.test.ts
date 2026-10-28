// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { resetSettingsCacheForTest } from '@/content/settings-cache';
import { NOTHING_TO_TRANSLATE_NOTICE } from '@/shared/nothing-to-translate';
import { getContainer } from '@/content/shadowHost';
// The real tooltip, so its task-change wrapper runs between the header and the handler.
import { closeTooltip } from '@/content/tipState.svelte';

const showToastMock = vi.fn();
vi.mock('@/content/toast', () => ({
  showToast: (...a: unknown[]) => showToastMock(...a),
  dismissToast: vi.fn(),
  closeStickyToast: vi.fn(),
}));

await import('@/content/index');

const LINK = 'https://example.com/a/b?c=1';

function starts(): { options?: { task?: string } }[] {
  return (chromeMock.runtime.sendMessage as Mock).mock.calls
    .map((c) => c[0] as { kind?: string; options?: { task?: string } })
    .filter((m) => m.kind === 'translate:start');
}

function taskSelect(): HTMLSelectElement | null {
  return getContainer().querySelector<HTMLSelectElement>('.tooltip [data-ega-task-select]');
}

beforeEach(async () => {
  await chromeMock.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, defaultDisplayMode: 'tooltip' },
  });
  resetSettingsCacheForTest();
  showToastMock.mockClear();
  (chromeMock.runtime.sendMessage as Mock).mockClear();
  (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
});

afterEach(() => {
  closeTooltip();
  document.body.innerHTML = '';
});

describe('a declined switch to Translate keeps the tooltip on the task it shows', () => {
  it('Explain on a link, then Translate in the header: still Explain, nothing sent', async () => {
    chromeMock.runtime.onMessage.emit(
      { kind: 'ctx:translate-selection', text: LINK, task: 'explain' },
      { id: chromeMock.runtime.id },
      () => {},
    );
    await vi.waitFor(() => expect(taskSelect()?.value).toBe('explain'));
    expect(starts()).toHaveLength(1);

    const select = taskSelect();
    if (!select) throw new Error('test setup: the header task select is missing');
    select.value = 'translate';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(showToastMock).toHaveBeenCalledWith(NOTHING_TO_TRANSLATE_NOTICE));
    await new Promise((r) => setTimeout(r, 0));
    expect(taskSelect()).toBe(select);
    expect(taskSelect()?.value).toBe('explain');
    expect(starts()).toHaveLength(1);
  });
});
