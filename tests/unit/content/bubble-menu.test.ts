// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent } from '@testing-library/svelte';
import { mountShadowHost, getShadowRoot } from '@/content/shadowHost';
import { showBubble, hideBubble } from '@/content/bubble';
import { openBubbleMenu, closeBubbleMenu } from '@/content/bubble-menu';
import { dismissToast } from '@/content/toast';

function rect(): DOMRect {
  return {
    x: 10,
    y: 10,
    left: 10,
    top: 10,
    right: 110,
    bottom: 40,
    width: 100,
    height: 30,
    toJSON: () => ({}),
  } as DOMRect;
}

function chevron(): HTMLButtonElement {
  const c = getShadowRoot().querySelector<HTMLButtonElement>('.bubble-more');
  if (!c) throw new Error('no chevron');
  return c;
}

function items(): HTMLButtonElement[] {
  return [...getShadowRoot().querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
}

function toastText(): string {
  return getShadowRoot().querySelector('.ega-toast')?.textContent ?? '';
}

beforeEach(() => {
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [];
  mountShadowHost();
  showBubble({ rect: rect(), queued: 0, onClick: () => {} });
});

afterEach(() => {
  closeBubbleMenu();
  hideBubble();
  dismissToast();
});

describe('bubble menu', () => {
  it('opens from the keyboard on its first item, and arrows move between the two items', async () => {
    openBubbleMenu(chevron(), { focusFirst: true, hideBubble });
    const [off, settings] = items();
    expect(items().map((i) => i.textContent)).toEqual(['Turn off on this site', 'Bubble settings']);
    expect(chevron().getAttribute('aria-expanded')).toBe('true');
    await vi.waitFor(() => expect(getShadowRoot().activeElement).toBe(off));
    await fireEvent.keyDown(off as HTMLElement, { key: 'ArrowDown' });
    expect(getShadowRoot().activeElement).toBe(settings);
    await fireEvent.keyDown(settings as HTMLElement, { key: 'ArrowDown' });
    expect(getShadowRoot().activeElement).toBe(off);
  });

  it('Esc closes it and puts focus back on the chevron', async () => {
    openBubbleMenu(chevron(), { focusFirst: true, hideBubble });
    await fireEvent.keyDown(items()[0] as HTMLElement, { key: 'Escape' });
    expect(items()).toHaveLength(0);
    expect(getShadowRoot().activeElement).toBe(chevron());
    expect(chevron().getAttribute('aria-expanded')).toBe('false');
  });

  it('a pointer press outside closes it', async () => {
    openBubbleMenu(chevron(), { focusFirst: false, hideBubble });
    await fireEvent.pointerDown(document.body);
    expect(items()).toHaveLength(0);
  });

  it('Turn off on this site sets the site off, hides the bubble and offers Undo', async () => {
    const send = chrome.runtime.sendMessage as unknown as Mock;
    send.mockResolvedValue({ ok: true });
    openBubbleMenu(chevron(), { focusFirst: false, hideBubble });
    await fireEvent.click(items()[0] as HTMLElement);
    expect(send).toHaveBeenCalledWith({ kind: 'site:set-enabled', enabled: false });
    expect(getShadowRoot().querySelector('.bubble')).toBeNull();
    await vi.waitFor(() =>
      expect(toastText()).toContain('Turn it back on from the Ega toolbar button.'),
    );
    const undo = getShadowRoot().querySelector<HTMLButtonElement>('[data-ega-toast-action]');
    expect(undo?.textContent).toBe('Undo');
    undo?.click();
    expect(send).toHaveBeenLastCalledWith({ kind: 'site:set-enabled', enabled: true });
  });

  it('says so when the switch could not be saved', async () => {
    (chrome.runtime.sendMessage as unknown as Mock).mockResolvedValue({ ok: false });
    openBubbleMenu(chevron(), { focusFirst: false, hideBubble });
    await fireEvent.click(items()[0] as HTMLElement);
    await vi.waitFor(() => expect(toastText()).toContain("Ega couldn't save this change."));
  });

  it.each([
    ['Turn off on this site', 0],
    ['Bubble settings', 1],
  ])('%s from the keyboard puts focus back where it was before the bubble', async (_, at) => {
    (chrome.runtime.sendMessage as unknown as Mock).mockResolvedValue({ ok: true });
    const field = document.createElement('textarea');
    document.body.append(field);
    field.focus();
    chevron().focus();
    // The real keyboard path: ArrowDown on the chevron opens the menu on its first item.
    await fireEvent.keyDown(chevron(), { key: 'ArrowDown' });
    await vi.waitFor(() => expect(getShadowRoot().activeElement).toBe(items()[0]));
    const item = items()[at] as HTMLButtonElement;
    item.focus();
    // A keyboard click: Enter on a button fires click with detail 0.
    await fireEvent.click(item, { detail: 0 });
    expect(getShadowRoot().querySelector('.bubble')).toBeNull();
    expect(document.activeElement).toBe(field);
    field.remove();
  });

  it('Bubble settings opens the Selection & picker tab', async () => {
    const send = chrome.runtime.sendMessage as unknown as Mock;
    openBubbleMenu(chevron(), { focusFirst: false, hideBubble });
    await fireEvent.click(items()[1] as HTMLElement);
    expect(send).toHaveBeenCalledWith({ kind: 'ui:open-options', tab: 'selection-bubble' });
  });
});
