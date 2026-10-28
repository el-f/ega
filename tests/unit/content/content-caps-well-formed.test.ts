// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { MAX_SELECTION_CHARS, STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { ensureSettings, resetSettingsCacheForTest } from '@/content/settings-cache';
import { drainAsync } from '@tests/_helpers/async';
import { isWellFormed } from '@tests/_helpers/well-formed';
import type { MsgReply } from '@/shared/messages';
// Static so the lazy tooltip import resolves off the warm module graph, not mid-teardown.
import '@/content/tipState.svelte';

vi.mock('@/content/lazy-tooltip', () => ({
  openTooltip: vi.fn(),
  closeTooltip: vi.fn(),
  errorTooltip: vi.fn(),
  getTooltipBody: vi.fn(),
}));

const content = await import('@/content/index');

// The emoji sits across the cap: a plain slice keeps only its first half, a lone surrogate.
const LONG = `${'a'.repeat(MAX_SELECTION_CHARS - 1)}😀 and more`;

const RECT = {
  left: 0,
  top: 0,
  right: 10,
  bottom: 10,
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  toJSON: () => ({}),
} as DOMRect;

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

function askSelection(): Promise<MsgReply['ega:get-selection']> {
  return new Promise((resolve) => {
    chromeMock.runtime.onMessage.emit(
      { kind: 'ega:get-selection' },
      { id: chromeMock.runtime.id },
      (r: unknown) => resolve(r as MsgReply['ega:get-selection']),
    );
  });
}

async function sentText(): Promise<string> {
  let text: string | undefined;
  await vi.waitFor(() => {
    const start = (chromeMock.runtime.sendMessage as Mock).mock.calls
      .map((c) => c[0] as { kind?: string; text?: string })
      .find((m) => m.kind === 'translate:start');
    expect(start).toBeDefined();
    text = start?.text;
  });
  return text ?? '';
}

beforeEach(async () => {
  await chromeMock.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, defaultDisplayMode: 'tooltip' },
  });
  resetSettingsCacheForTest();
  (chromeMock.runtime.sendMessage as Mock).mockClear();
  (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
});

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

describe('text caps never split an emoji', () => {
  it('a translate of a long text', async () => {
    await content.startTranslateText(LONG, RECT);
    const text = await sentText();
    expect(text.length).toBeLessThanOrEqual(MAX_SELECTION_CHARS);
    expect(text.length).toBeGreaterThan(MAX_SELECTION_CHARS - 10);
    expect(isWellFormed(text)).toBe(true);
  });

  it('the shortcut on a long selection', async () => {
    select(LONG);
    chromeMock.runtime.onMessage.emit(
      { kind: 'hotkey:translate' },
      { id: chromeMock.runtime.id },
      () => {},
    );
    const text = await sentText();
    expect(text.length).toBeGreaterThan(MAX_SELECTION_CHARS - 10);
    expect(isWellFormed(text)).toBe(true);
  });

  it('the popup prefill from a live selection', async () => {
    // The popup reads the cache in the same tick; a cold cache answers as a site that is off.
    await ensureSettings();
    select(LONG);
    const { text } = await askSelection();
    expect(text.length).toBeGreaterThan(MAX_SELECTION_CHARS - 10);
    expect(isWellFormed(text)).toBe(true);
  });

  it('the popup prefill from a selection the page dropped', async () => {
    select(LONG);
    document.dispatchEvent(new Event('selectionchange'));
    await drainAsync();
    window.getSelection()?.removeAllRanges();
    const { text } = await askSelection();
    expect(text.length).toBeGreaterThan(MAX_SELECTION_CHARS - 10);
    expect(isWellFormed(text)).toBe(true);
  });
});
