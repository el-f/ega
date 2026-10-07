// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

const STUCK_MS = 90_000;

function toast(): HTMLElement | null {
  const root = document.getElementById('ega-shadow-host')?.shadowRoot;
  return root?.querySelector<HTMLElement>('.ega-toast') ?? null;
}

async function translateInPlace(settings: Settings): Promise<void> {
  vi.resetModules();
  const { setSettings } = await import('@/content/settings-cache');
  setSettings(settings);
  const inline = await import('@/content/inlineReplace');
  const p = document.getElementById('p') as HTMLElement;
  const range = document.createRange();
  range.selectNodeContents(p);
  inline.openInline({ requestId: 'r1', range, stuckTimeoutMs: STUCK_MS });
  inline.appendInlineDelta('r1', '{"translation":"Hello there"}');
  inline.finishInline('r1');
}

// The first import transforms the whole inline graph; on a busy machine that alone outruns a test's 5 s.
beforeAll(async () => {
  await import('@/content/inlineReplace');
});

beforeEach(() => {
  document.body.innerHTML = '<p id="p">mar7aba ya 5ayye</p>';
});

afterEach(async () => {
  const { dismissToast } = await import('@/content/toast');
  dismissToast();
  // Each test loads a fresh inline module; this one's page listeners must not answer the next test's Esc.
  (await import('@/content/inlineReplace')).teardownInline();
  document.getElementById('ega-shadow-host')?.remove();
});

describe('inline replace — the first replace says how to undo it', () => {
  it('shows a toast naming Esc, with an Undo button that puts the original back', async () => {
    const send = vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    await translateInPlace({ ...DEFAULT_SETTINGS, inlineUndoHintShown: false });

    expect(document.getElementById('p')?.textContent).toBe('Hello there');
    expect(toast()?.textContent).toContain('Press Esc twice');
    expect(send).toHaveBeenCalledWith({
      kind: 'settings:update',
      patch: { inlineUndoHintShown: true },
    });

    toast()?.querySelector<HTMLButtonElement>('[data-ega-toast-action]')?.click();
    expect(document.getElementById('p')?.textContent).toBe('mar7aba ya 5ayye');
    expect(document.querySelector('[data-ega-replaced]')).toBeNull();
  });

  it('writes the shown flag before the toast appears', async () => {
    let toastAtWrite: HTMLElement | null | undefined;
    (chrome.runtime.sendMessage as Mock).mockImplementation((msg: unknown) => {
      if ((msg as { kind?: string }).kind === 'settings:update') toastAtWrite = toast();
      return Promise.resolve(undefined);
    });
    await translateInPlace({ ...DEFAULT_SETTINGS, inlineUndoHintShown: false });

    expect(toast()).not.toBeNull();
    expect(toastAtWrite).toBeNull();
  });

  it('the toast Undo puts the last wrapper back and lets go of the page-wide Esc listener', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    await translateInPlace({ ...DEFAULT_SETTINGS, inlineUndoHintShown: false });
    const removed = vi.spyOn(document, 'removeEventListener');

    toast()?.querySelector<HTMLButtonElement>('[data-ega-toast-action]')?.click();

    expect(document.querySelector('[data-ega-replaced]')).toBeNull();
    expect(removed).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(removed).toHaveBeenCalledWith('mouseover', expect.any(Function), true);
  });

  it('Esc twice puts the page back and takes the toast Undo away with it', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    await translateInPlace({ ...DEFAULT_SETTINGS, inlineUndoHintShown: false });
    expect(toast()?.querySelector('[data-ega-toast-action]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(document.getElementById('p')?.textContent).toBe('mar7aba ya 5ayye');
    expect(toast()?.querySelector('[data-ega-toast-action]') ?? null).toBeNull();
  });

  it('Esc inside the toast closes the toast and is not counted toward the page restore', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    await translateInPlace({ ...DEFAULT_SETTINGS, inlineUndoHintShown: false });
    const dismiss = toast()?.querySelector<HTMLButtonElement>('[data-ega-toast-close]');
    dismiss?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    expect(toast()).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('p')?.textContent).toBe('Hello there');
  });

  it('Esc on Ega UI with no Esc of its own (the bubble, a pill) still counts toward the restore', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    await translateInPlace({ ...DEFAULT_SETTINGS, inlineUndoHintShown: true });
    const { getContainer } = await import('@/content/shadowHost');
    const pill = document.createElement('button');
    getContainer().appendChild(pill);
    for (let i = 0; i < 2; i++)
      pill.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
      );
    expect(document.getElementById('p')?.textContent).toBe('mar7aba ya 5ayye');
  });

  it('Esc inside the tooltip panel is the tooltip’s, and is not counted toward the page restore', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    await translateInPlace({ ...DEFAULT_SETTINGS, inlineUndoHintShown: true });
    // Same module graph as the inline code under test, which translateInPlace just reset.
    const { mount, unmount, createRawSnippet } = await import('svelte');
    const { default: DraggablePanel } = await import('@/shared/components/DraggablePanel.svelte');
    const { getContainer } = await import('@/content/shadowHost');
    const onClose = vi.fn();
    const panel = mount(DraggablePanel, {
      target: getContainer(),
      props: {
        left: 0,
        top: 0,
        ariaLabel: 'Ega translation',
        onClose,
        children: createRawSnippet(() => ({ render: () => '<button>Copy</button>' })),
      },
    });
    const copy = getContainer().querySelector('.ega-draggable-panel button') as HTMLElement;
    for (let i = 0; i < 2; i++)
      copy.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
      );
    expect(onClose).toHaveBeenCalled();
    expect(document.getElementById('p')?.textContent).toBe('Hello there');
    void unmount(panel);
  });

  it.each([
    [
      'the picker',
      async () => {
        const { createPicker } = await import('@/content/picker');
        const picker = createPicker({ onPick: () => {}, onExit: () => {} });
        picker.enter();
        return () => picker.isActive();
      },
    ],
    [
      'multi-select',
      async () => {
        const ms = await import('@/content/page-translate-v2/multi-select');
        ms.enterMultiSelect({ initialMode: 'bilingual', onFire: () => {} });
        return () => ms.isMultiSelectActive();
      },
    ],
  ])('Esc that ends %s leaves the page translated', async (_mode, enterMode) => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    await translateInPlace({ ...DEFAULT_SETTINGS, inlineUndoHintShown: true });
    const active = await enterMode();
    // Picking moves the pointer over the translated text, which alone confirms a restore.
    document
      .querySelector('[data-ega-replaced]')
      ?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(active()).toBe(false);
    expect(document.getElementById('p')?.textContent).toBe('Hello there');
  });

  it('Esc that ends a picker opened before the translate leaves the page translated', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    // The picker's Esc listener is added first, so it runs before the inline one.
    const { createPicker } = await import('@/content/picker');
    const picker = createPicker({ onPick: () => {}, onExit: () => {} });
    picker.enter();
    await translateInPlace({ ...DEFAULT_SETTINGS, inlineUndoHintShown: true });
    document
      .querySelector('[data-ega-replaced]')
      ?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(picker.isActive()).toBe(false);
    expect(document.getElementById('p')?.textContent).toBe('Hello there');
  });

  it('Esc that ends multi-select opened before the translate leaves the page translated', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    // Multi-select's Esc listener is added first, so it runs before the inline one.
    const ms = await import('@/content/page-translate-v2/multi-select');
    ms.enterMultiSelect({ initialMode: 'bilingual', onFire: () => {} });
    await translateInPlace({ ...DEFAULT_SETTINGS, inlineUndoHintShown: true });
    document
      .querySelector('[data-ega-replaced]')
      ?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(ms.isMultiSelectActive()).toBe(false);
    expect(document.getElementById('p')?.textContent).toBe('Hello there');
  });

  it('stays quiet once the hint was shown', async () => {
    await translateInPlace({ ...DEFAULT_SETTINGS, inlineUndoHintShown: true });
    expect(document.getElementById('p')?.textContent).toBe('Hello there');
    expect(toast()).toBeNull();
  });
});
