// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { resetSettingsCacheForTest } from '@/content/settings-cache';
import { exitMultiSelect, isMultiSelectActive } from '@/content/page-translate-v2/multi-select';

const tooltip = vi.hoisted(() => ({ closeTooltip: vi.fn() }));
vi.mock('@/content/lazy-tooltip', () => ({
  openTooltip: vi.fn(),
  finishTooltipDirect: vi.fn(),
  errorTooltip: vi.fn(),
  closeTooltip: tooltip.closeTooltip,
}));

await import('@/content/index');

// Spec 1.4: a picker mode closes the bubble and the text tooltip; page translate leaves an open tooltip alone.

function send(kind: string): void {
  chromeMock.runtime.onMessage.emit({ kind }, { id: chromeMock.runtime.id }, () => {});
}

beforeEach(async () => {
  await chromeMock.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  resetSettingsCacheForTest();
  (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
  document.body.innerHTML = '<p id="p">alpha beta gamma</p>';
  tooltip.closeTooltip.mockClear();
});

afterEach(() => {
  exitMultiSelect();
});

describe('starting Choose areas', () => {
  it('closes the text tooltip, like Pick element does', async () => {
    send('page:chooseAreas');
    await vi.waitFor(() => expect(isMultiSelectActive()).toBe(true), { timeout: 5000 });
    expect(tooltip.closeTooltip).toHaveBeenCalled();
  });
});
