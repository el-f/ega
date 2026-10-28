// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { resetSettingsCacheForTest } from '@/content/settings-cache';
import { NOTHING_TO_TRANSLATE_NOTICE } from '@/shared/nothing-to-translate';
// Static so the lazy tooltip import resolves off the warm module graph, not mid-teardown.
import '@/content/tipState.svelte';

vi.mock('@/content/lazy-tooltip', () => ({
  openTooltip: vi.fn(),
  closeTooltip: vi.fn(),
  errorTooltip: vi.fn(),
  getTooltipBody: vi.fn(),
}));

const showToastMock = vi.fn();
vi.mock('@/content/toast', () => ({
  showToast: (...a: unknown[]) => showToastMock(...a),
  dismissToast: vi.fn(),
  closeStickyToast: vi.fn(),
}));

await import('@/content/index');
const { openTooltip } = await import('@/content/lazy-tooltip');

const LINK = 'https://example.com/a/b?c=1';

function select(text: string): void {
  document.body.innerHTML = '<p id="p"></p>';
  const p = document.getElementById('p');
  if (!p) throw new Error('test setup: paragraph missing');
  p.textContent = text;
  const r = document.createRange();
  r.selectNodeContents(p);
  const s = window.getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}

function emit(msg: Record<string, unknown>): void {
  chromeMock.runtime.onMessage.emit(msg, { id: chromeMock.runtime.id }, () => {});
}

function starts(): { text?: string; options?: { task?: string } }[] {
  return (chromeMock.runtime.sendMessage as Mock).mock.calls
    .map((c) => c[0] as { kind?: string; text?: string; options?: { task?: string } })
    .filter((m) => m.kind === 'translate:start');
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
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

describe('a Translate of only links or numbers is answered on the page', () => {
  it('the shortcut on a link sends nothing and says why', async () => {
    select(LINK);
    emit({ kind: 'hotkey:translate' });
    await vi.waitFor(() => expect(showToastMock).toHaveBeenCalledWith(NOTHING_TO_TRANSLATE_NOTICE));
    expect(starts()).toEqual([]);
  });

  it('the right-click Translate on numbers and symbols sends nothing', async () => {
    emit({ kind: 'ctx:translate-selection', text: '42 + 7 = 49 %' });
    await vi.waitFor(() => expect(showToastMock).toHaveBeenCalledWith(NOTHING_TO_TRANSLATE_NOTICE));
    expect(starts()).toEqual([]);
  });

  it('a link with words around it still goes to the model', async () => {
    select(`Read ${LINK} today`);
    emit({ kind: 'hotkey:translate' });
    await vi.waitFor(() => expect(starts()).toHaveLength(1));
    expect(showToastMock).not.toHaveBeenCalledWith(NOTHING_TO_TRANSLATE_NOTICE);
  });

  it('another task on a link still goes to the model', async () => {
    emit({ kind: 'ctx:translate-selection', text: LINK, task: 'explain' });
    await vi.waitFor(() => expect(starts()).toHaveLength(1));
    expect(starts()[0]?.options?.task).toBe('explain');
  });

  it("the tooltip's Answer again as Translate on a link sends nothing", async () => {
    emit({ kind: 'ctx:translate-selection', text: LINK, task: 'explain' });
    await vi.waitFor(() => expect(starts()).toHaveLength(1));
    const opts = vi.mocked(openTooltip).mock.calls.at(-1)?.[0];
    if (!opts) throw new Error('test setup: the tooltip never opened');

    opts.onTaskChange?.('translate', 'neutral');

    await vi.waitFor(() => expect(showToastMock).toHaveBeenCalledWith(NOTHING_TO_TRANSLATE_NOTICE));
    expect(starts()).toHaveLength(1);
  });
});
