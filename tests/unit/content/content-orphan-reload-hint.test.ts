// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { setRuntimeId } from '@tests/_helpers/runtime';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

// Each case boots a fresh content script: the hint arms once per script, like a real page.
async function boot(settings: Settings): Promise<void> {
  vi.resetModules();
  setRuntimeId('ega-test');
  await import('@/content/index');
  const cache = await import('@/content/settings-cache');
  await cache.ensureSettings();
  cache.setSettings(settings);
}

function select(text: string): void {
  document.body.innerHTML = `<p id="p">${text}</p>`;
  const node = document.getElementById('p')?.firstChild;
  if (!node) throw new Error('paragraph text node missing');
  const r = document.createRange();
  r.selectNodeContents(node);
  const s = window.getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}

function toast(): HTMLElement | null {
  const root = document.getElementById('ega-shadow-host')?.shadowRoot;
  return root?.querySelector<HTMLElement>('[data-ega-toast-wrap]') ?? null;
}

/** The extension reloads, and the first event the orphan sees is a collapsed caret. */
function killContext(): void {
  setRuntimeId(undefined);
  window.getSelection()?.removeAllRanges();
  document.dispatchEvent(new Event('selectionchange'));
}

const FOREIGN = 'שלום עולם, מה שלומך היום?';
const SHORTCUT = { key: 'L', ctrlKey: true, shiftKey: true };

// The first import transforms the whole content script; on a loaded box that alone outlasts a test's 5 s.
beforeAll(async () => {
  await import('@/content/index');
}, 60_000);

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  setRuntimeId('ega-test');
  window.getSelection()?.removeAllRanges();
  for (const h of Array.from(document.querySelectorAll('#ega-shadow-host'))) h.remove();
  document.body.innerHTML = '';
});

describe('an orphaned content script still says why Ega stopped', () => {
  it('stays quiet on the caret move that tears it down, then hints once on a real selection', async () => {
    await boot(DEFAULT_SETTINGS);
    killContext();
    expect(toast()).toBeNull();

    select(FOREIGN);
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(toast()?.textContent).toContain('reload the page');
    expect(toast()?.querySelector('[data-ega-toast-action]')?.textContent).toBe('Reload page');

    toast()?.parentElement?.replaceChildren();
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(toast()).toBeNull();
  });

  it('the shortcut that finds the dead context gets the hint at once', async () => {
    await boot(DEFAULT_SETTINGS);
    setRuntimeId(undefined);

    document.dispatchEvent(new KeyboardEvent('keydown', SHORTCUT));

    expect(toast()?.textContent).toContain('reload the page');
  });

  it('an unrelated key or an English selection in smart mode does not nag, and the hint waits', async () => {
    await boot(DEFAULT_SETTINGS);
    killContext();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    select('This is a plain English sentence that needs no help.');
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(toast()).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', SHORTCUT));
    expect(toast()?.textContent).toContain('reload the page');
  });

  it('never hints on a site the user turned Ega off for', async () => {
    await boot({ ...DEFAULT_SETTINGS, sitePrefs: { [location.origin]: { disabled: true } } });
    killContext();

    select(FOREIGN);
    document.dispatchEvent(new MouseEvent('mouseup'));
    document.dispatchEvent(new KeyboardEvent('keydown', SHORTCUT));

    expect(toast()).toBeNull();
  });
});
