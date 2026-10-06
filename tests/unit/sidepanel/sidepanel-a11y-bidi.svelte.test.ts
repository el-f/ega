// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { openTaskMenu, swapItem } from './_task-menu';

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

afterEach(() => vi.clearAllMocks());

describe('SidePanel — text a user types in Hebrew or Arabic', () => {
  it('the composer and the search field lay out by their own first strong character', async () => {
    const { container } = render(SidePanel);
    await tick();
    expect(container.querySelector('#sp-text')?.getAttribute('dir')).toBe('auto');

    const toggle = container.querySelector<HTMLButtonElement>('[data-ega-search-toggle]');
    if (!toggle) throw new Error('search toggle not found');
    await fireEvent.click(toggle);
    await tick();
    expect(container.querySelector('[data-ega-search]')?.getAttribute('dir')).toBe('auto');
  });
});

describe('SidePanel — j moves the real focus, not only a ring', () => {
  it('puts DOM focus on the turn the ring is on', async () => {
    const { container } = render(SidePanel);
    await tick();
    const composerEl = container.querySelector<HTMLTextAreaElement>('#sp-text');
    if (!composerEl) throw new Error('composer not found');
    await fireEvent.input(composerEl, { target: { value: 'a message' } });
    await tick();
    const sendBtn = container.querySelector<HTMLButtonElement>('.ega-send');
    if (!sendBtn) throw new Error('send button not found');
    await fireEvent.click(sendBtn);
    await tick();
    await tick();

    await fireEvent.keyDown(window, { key: 'j', target: document.body });
    await tick();

    const focused = container.querySelector<HTMLElement>('.focused');
    expect(focused).not.toBeNull();
    expect(document.activeElement).toBe(focused);
  });
});

describe('a blocked swap button says why in its label', () => {
  it('the composer swap carries the reason', async () => {
    const { container } = render(SidePanel);
    await tick();
    const swap = container.querySelector<HTMLButtonElement>('.ega-lang-pair .swap');
    if (!swap) throw new Error('composer swap not found');
    // aria-disabled keeps it a tab stop, so the label is reachable from the keyboard.
    expect(swap.disabled).toBe(false);
    expect(swap.getAttribute('aria-disabled')).toBe('true');
    expect(swap.getAttribute('aria-label')).toContain('source language');
  });

  it('the turn swap item carries the reason as text', async () => {
    const turn: Turn = {
      id: 'a1',
      role: 'assistant',
      createdAt: 1,
      kind: 'translate',
      status: 'done',
      content: 'hello',
    };
    const { container } = render(AssistantTurn, {
      props: {
        turn,
        onRetry: vi.fn(),
        isLatest: true,
        onSwap: vi.fn(),
        swapDisabled: true,
      },
    });
    await openTaskMenu(container);
    expect(swapItem().getAttribute('aria-disabled')).toBe('true');
    expect(swapItem().textContent).toContain('source language');
  });
});

describe('SidePanel — the shortcuts panel the palette advertises', () => {
  it('? opens it and Escape closes it', async () => {
    const { container } = render(SidePanel);
    await tick();
    expect(document.querySelector('[data-ega-shortcut-xref]')).toBeNull();

    await fireEvent.keyDown(window, { key: '?', target: document.body });
    await tick();
    expect(document.querySelector('[data-ega-shortcut-xref]')).not.toBeNull();

    await fireEvent.keyDown(window, { key: 'Escape' });
    await tick();
    expect(document.querySelector('[data-ega-shortcut-xref]')).toBeNull();
    void container;
  });

  it('lists the keys the user rebound, not the shipped defaults', async () => {
    const stored = { ...DEFAULT_SETTINGS, shortcut: 'Alt+Shift+Y', pickerShortcut: 'Ctrl+Alt+P' };
    await chrome.storage.local.set({ 'ega.settings': stored });

    render(SidePanel);
    await tick();
    await tick();
    await fireEvent.keyDown(window, { key: '?', target: document.body });
    await tick();

    const rows = Array.from(document.querySelectorAll('.shortcut-row'));
    const rowText = (term: string): string =>
      rows
        .find((r) => (r.querySelector('dt')?.textContent ?? '').includes(term))
        ?.querySelector('dd')?.textContent ?? '';
    expect(rowText('Translate selection')).toContain('Y');
    expect(rowText('Translate selection')).not.toContain('Ctrl');
    expect(rowText('Start the element picker')).toContain('P');
  });

  it('? typed into a text field is just a question mark', async () => {
    const { container } = render(SidePanel);
    await tick();
    const toggle = container.querySelector<HTMLButtonElement>('[data-ega-search-toggle]');
    if (!toggle) throw new Error('search toggle not found');
    await fireEvent.click(toggle);
    await tick();

    // The search box lets its keydowns reach the window handler, so the guard is what stops this.
    const search = container.querySelector<HTMLInputElement>('[data-ega-search]');
    if (!search) throw new Error('search field not found');
    await fireEvent.keyDown(search, { key: '?', bubbles: true });
    await tick();
    expect(document.querySelector('[data-ega-shortcut-xref]')).toBeNull();

    const composer = container.querySelector<HTMLTextAreaElement>('#sp-text');
    if (!composer) throw new Error('composer not found');
    await fireEvent.keyDown(composer, { key: '?' });
    await tick();
    expect(document.querySelector('[data-ega-shortcut-xref]')).toBeNull();
  });
});
