// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { chromeMock, workerReply } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { ensureSettings, resetSettingsCacheForTest } from '@/content/settings-cache';
import { flushAsync } from '@tests/_helpers/async';
// Static so the lazy tooltip import resolves off the warm module graph, not mid-teardown.
import '@/content/tipState.svelte';

const enterPickerImpl = vi.fn().mockResolvedValue(undefined);
vi.mock('@/content/picker-overlay', () => ({
  enterPickerMode: (...a: unknown[]) => enterPickerImpl(...a) as Promise<void>,
}));

const showToastMock = vi.fn();
vi.mock('@/content/toast', () => ({
  showToast: (...a: unknown[]) => showToastMock(...a),
  dismissToast: vi.fn(),
}));

const content = await import('@/content/index');

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

function seed(sitePrefs: Record<string, unknown>): Promise<void> {
  return chromeMock.storage.local.set({
    [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, sitePrefs },
  });
}

function sentKinds(): string[] {
  return (chromeMock.runtime.sendMessage as Mock).mock.calls.map(
    (c) => (c[0] as { kind?: string }).kind ?? '',
  );
}

/** The selectionchange handler keeps or refuses the selection right after it reads settings. */
async function selectionHandled(): Promise<void> {
  await ensureSettings();
  await flushAsync();
}

/** Drives the real onMessage listener and resolves with what it answered. */
function ask(msg: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve) => {
    chromeMock.runtime.onMessage.emit(msg, { id: chromeMock.runtime.id }, resolve);
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
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

describe('site disabled — no text leaves the page by any path', () => {
  beforeEach(async () => {
    // jsdom serves the page at http://localhost:3000, which is what location.origin reads.
    await seed({ 'http://localhost:3000': { disabled: true } });
    resetSettingsCacheForTest();
    (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
    showToastMock.mockClear();
    enterPickerImpl.mockClear();
  });

  it('the refusal names the way back on', () => {
    expect(content.SITE_OFF_MESSAGE).toContain('Ega is off for this site.');
    expect(content.SITE_OFF_MESSAGE).toContain('Enable Ega on this site');
    // The page items show only on empty page space, inside the Ega submenu.
    expect(content.SITE_OFF_MESSAGE).toContain('Right-click empty page space, then choose Ega ▸');
  });

  it('startTranslateText sends nothing and says why', async () => {
    await content.startTranslateText('hola mundo', RECT);

    expect(sentKinds()).not.toContain('translate:start');
    expect(showToastMock).toHaveBeenCalledWith(content.SITE_OFF_MESSAGE);
  });

  it('page:translateAll is refused', async () => {
    chromeMock.runtime.onMessage.emit(
      { kind: 'page:translateAll' },
      { id: chromeMock.runtime.id },
      () => {},
    );
    await vi.waitFor(() => expect(showToastMock).toHaveBeenCalledWith(content.SITE_OFF_MESSAGE));

    expect(sentKinds()).not.toContain('translate:start');
  });

  it('the picker never opens', async () => {
    await content.enterPickerMode();

    expect(enterPickerImpl).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith(content.SITE_OFF_MESSAGE);
  });

  it('a selection is not kept for the popup once the page drops it', async () => {
    selectWord();
    document.dispatchEvent(new Event('selectionchange'));
    await selectionHandled();
    window.getSelection()?.removeAllRanges();

    expect(await ask({ kind: 'ega:get-selection' })).toEqual({ text: '' });
    expect(chromeMock.storage.session._raw.has('ega.lastSelection')).toBe(false);
  });

  it('the popup cannot pull the selection', async () => {
    await ensureSettings();
    selectWord();

    expect(await ask({ kind: 'ega:get-selection' })).toEqual({ text: '' });
  });

  it('the side panel cannot pull the page context', async () => {
    await ensureSettings();
    document.title = 'Secret internal wiki';

    expect(await ask({ kind: 'ega:get-page-context', level: 'minimal' })).toEqual({
      context: null,
    });
  });
});

describe('site enabled — the same paths still run', () => {
  beforeEach(async () => {
    await seed({});
    resetSettingsCacheForTest();
    (chromeMock.runtime.sendMessage as Mock).mockImplementation(workerReply);
    showToastMock.mockClear();
    enterPickerImpl.mockClear();
  });

  it('startTranslateText still dispatches', async () => {
    await content.startTranslateText('hola mundo', RECT);

    expect(sentKinds()).toContain('translate:start');
  });

  it('the picker still opens', async () => {
    await content.enterPickerMode();

    expect(enterPickerImpl).toHaveBeenCalled();
  });

  it('a selection is kept for the popup after the page drops it, and never stored', async () => {
    selectWord();
    document.dispatchEvent(new Event('selectionchange'));
    await selectionHandled();
    window.getSelection()?.removeAllRanges();

    expect(await ask({ kind: 'ega:get-selection' })).toEqual({ text: 'beta' });
    expect(chromeMock.storage.session._raw.has('ega.lastSelection')).toBe(false);
  });

  it('the popup still pulls the selection', async () => {
    await ensureSettings();
    selectWord();

    expect(await ask({ kind: 'ega:get-selection' })).toEqual({ text: 'beta' });
  });

  it('the side panel still pulls the page context', async () => {
    await ensureSettings();
    document.title = 'Public docs';

    const reply = (await ask({ kind: 'ega:get-page-context', level: 'minimal' })) as {
      context: { pageTitle?: string } | null;
    };
    expect(reply.context?.pageTitle).toBe('Public docs');
  });
});

// currentSettings() is null until the boot read lands, and the two pull handlers answer in the same tick.
describe('settings not loaded yet — the pull handlers fail closed', () => {
  beforeEach(() => {
    resetSettingsCacheForTest();
  });

  it('answers empty rather than guessing the site is on', async () => {
    selectWord();

    expect(await ask({ kind: 'ega:get-selection' })).toEqual({ text: '' });
    expect(await ask({ kind: 'ega:get-page-context', level: 'minimal' })).toEqual({
      context: null,
    });
  });
});
