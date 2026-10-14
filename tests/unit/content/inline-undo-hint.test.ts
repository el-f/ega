// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

const STUCK_MS = 90_000;

function toast(): HTMLElement | null {
  const root = document.getElementById('ega-shadow-host')?.shadowRoot;
  return root?.querySelector<HTMLElement>('.ega-toast') ?? null;
}

async function translateInPlace(id = 'r1'): Promise<void> {
  const inline = await import('@/content/inlineReplace');
  const p = document.getElementById('p') as HTMLElement;
  const range = document.createRange();
  range.selectNodeContents(p);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
  inline.openInline({ requestId: id, range, stuckTimeoutMs: STUCK_MS });
  inline.appendInlineDelta(id, 'Hello there');
  inline.finishInline(id);
}

// The first import transforms the whole inline graph; on a busy machine that alone outruns a test's 5 s.
beforeAll(async () => {
  await import('@/content/inlineReplace');
});

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '<p id="p">mar7aba ya 5ayye</p>';
});

afterEach(async () => {
  const { dismissToast } = await import('@/content/toast');
  dismissToast();
  // Each test loads a fresh inline module; this one's page listeners must not answer the next test's Esc.
  (await import('@/content/inlineReplace')).teardownInline();
  document.getElementById('ega-shadow-host')?.remove();
});

describe('inline replace — every replace offers Undo', () => {
  it('says what happened, with an Undo that puts the original back', async () => {
    await translateInPlace();

    expect(document.getElementById('p')?.textContent).toBe('Hello there');
    expect(toast()?.textContent).toContain('Replaced with the translation.');
    expect(toast()?.dataset['kind']).toBe('success');

    toast()?.querySelector<HTMLButtonElement>('[data-ega-toast-action]')?.click();
    expect(document.getElementById('p')?.textContent).toBe('mar7aba ya 5ayye');
    expect(document.querySelector('[data-ega-replaced]')).toBeNull();
  });

  it('shows it again on the next replace, not only the first', async () => {
    await translateInPlace('r1');
    const { dismissToast } = await import('@/content/toast');
    dismissToast();
    document.body.innerHTML = '<p id="p">yalla bina</p>';
    await translateInPlace('r2');
    expect(toast()?.textContent).toContain('Replaced with the translation.');
  });

  it('lets go of the selection as soon as the replace starts, so the bubble cannot offer it again', async () => {
    const inline = await import('@/content/inlineReplace');
    const p = document.getElementById('p') as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(p);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    inline.openInline({ requestId: 'r-pending', range, stuckTimeoutMs: STUCK_MS });
    expect(document.querySelector('[data-ega-pending]')).not.toBeNull();
    expect(window.getSelection()?.isCollapsed).toBe(true);
    inline.restoreInline('r-pending');
  });

  it('moves the selection to the end of the replaced text', async () => {
    await translateInPlace();
    const sel = window.getSelection();
    expect(sel?.isCollapsed).toBe(true);
    const wrapper = document.querySelector('[data-ega-replaced]');
    expect(sel?.anchorNode === wrapper || wrapper?.contains(sel?.anchorNode ?? null)).toBe(true);
  });

  it('leaves a selection the user made elsewhere while the answer streamed', async () => {
    document.body.innerHTML = '<p id="p">mar7aba ya 5ayye</p><p id="q">yalla bina</p>';
    const inline = await import('@/content/inlineReplace');
    const p = document.getElementById('p') as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(p);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    inline.openInline({ requestId: 'r1', range, stuckTimeoutMs: STUCK_MS });
    const q = document.getElementById('q') as HTMLElement;
    const next = document.createRange();
    next.selectNodeContents(q);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(next);

    inline.appendInlineDelta('r1', 'Hello there');
    inline.finishInline('r1');

    const sel = window.getSelection();
    expect(sel?.isCollapsed).toBe(false);
    expect(sel?.toString()).toBe('yalla bina');
  });

  it('does not take the caret out of a field that has focus', async () => {
    document.body.innerHTML = '<p id="p">mar7aba ya 5ayye</p><input id="reply">';
    const inline = await import('@/content/inlineReplace');
    // Translate anyway from the popup runs on the kept range while the user types in a field.
    (document.getElementById('reply') as HTMLInputElement).focus();
    const p = document.getElementById('p') as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(p);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    inline.openInline({ requestId: 'r1', range, stuckTimeoutMs: STUCK_MS });

    expect(window.getSelection()?.isCollapsed).toBe(false);
    expect(document.activeElement?.id).toBe('reply');
    inline.restoreInline('r1');
  });

  it('the toast Undo puts the last wrapper back and lets go of the page-wide Esc listener', async () => {
    await translateInPlace();
    const removed = vi.spyOn(document, 'removeEventListener');

    toast()?.querySelector<HTMLButtonElement>('[data-ega-toast-action]')?.click();

    expect(document.querySelector('[data-ega-replaced]')).toBeNull();
    expect(removed).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(removed).toHaveBeenCalledWith('mouseover', expect.any(Function), true);
  });

  it('Esc twice puts the page back and takes the toast Undo away with it', async () => {
    await translateInPlace();
    expect(toast()?.querySelector('[data-ega-toast-action]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(document.getElementById('p')?.textContent).toBe('mar7aba ya 5ayye');
    expect(toast()?.querySelector('[data-ega-toast-action]') ?? null).toBeNull();
  });

  it('Esc inside the toast closes the toast and is not counted toward the page restore', async () => {
    await translateInPlace();
    const dismiss = toast()?.querySelector<HTMLButtonElement>('[data-ega-toast-close]');
    dismiss?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    expect(toast()).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('p')?.textContent).toBe('Hello there');
  });

  it('Esc on Ega UI with no Esc of its own (the bubble, a pill) still counts toward the restore', async () => {
    await translateInPlace();
    const { getContainer } = await import('@/content/shadowHost');
    const pill = document.createElement('button');
    getContainer().appendChild(pill);
    for (let i = 0; i < 2; i++)
      pill.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
      );
    expect(document.getElementById('p')?.textContent).toBe('mar7aba ya 5ayye');
  });

  it.each([
    [
      'the bubble menu',
      '<div class="bubble-menu" role="menu"><button role="menuitem">x</button></div>',
    ],
    [
      "the pill's More menu",
      '<div class="ega-batch-progress"><div role="menu"><button role="menuitem">x</button></div></div>',
    ],
    [
      "the pill's open More button",
      '<div class="ega-batch-progress"><button data-ega-batch-more aria-expanded="true">x</button></div>',
    ],
  ])('Esc that closes %s is not counted toward the page restore', async (_owner, html) => {
    await translateInPlace();
    const { getContainer } = await import('@/content/shadowHost');
    const host = document.createElement('div');
    host.innerHTML = html;
    getContainer().appendChild(host);
    const button = host.querySelector('button') as HTMLElement;
    for (let i = 0; i < 2; i++)
      button.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
      );
    expect(document.getElementById('p')?.textContent).toBe('Hello there');
  });

  it('Esc inside the tooltip panel is the tooltip’s, and is not counted toward the page restore', async () => {
    await translateInPlace();
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
    await translateInPlace();
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
    // The picker's Esc listener is added first, so it runs before the inline one.
    const { createPicker } = await import('@/content/picker');
    const picker = createPicker({ onPick: () => {}, onExit: () => {} });
    picker.enter();
    await translateInPlace();
    document
      .querySelector('[data-ega-replaced]')
      ?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(picker.isActive()).toBe(false);
    expect(document.getElementById('p')?.textContent).toBe('Hello there');
  });

  it('Esc that ends multi-select opened before the translate leaves the page translated', async () => {
    // Multi-select's Esc listener is added first, so it runs before the inline one.
    const ms = await import('@/content/page-translate-v2/multi-select');
    ms.enterMultiSelect({ initialMode: 'bilingual', onFire: () => {} });
    await translateInPlace();
    document
      .querySelector('[data-ega-replaced]')
      ?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(ms.isMultiSelectActive()).toBe(false);
    expect(document.getElementById('p')?.textContent).toBe('Hello there');
  });
});
