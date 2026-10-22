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

  it('after an Esc out of the menu, a keyboard choice still puts focus back on the page', async () => {
    (chrome.runtime.sendMessage as unknown as Mock).mockResolvedValue({ ok: true });
    const field = document.createElement('textarea');
    document.body.append(field);
    field.focus();
    chevron().focus();
    await fireEvent.keyDown(chevron(), { key: 'ArrowDown' });
    await vi.waitFor(() => expect(getShadowRoot().activeElement).toBe(items()[0]));
    await fireEvent.keyDown(items()[0] as HTMLElement, { key: 'Escape' });
    expect(getShadowRoot().activeElement).toBe(chevron());
    await fireEvent.keyDown(chevron(), { key: 'ArrowDown' });
    await vi.waitFor(() => expect(getShadowRoot().activeElement).toBe(items()[0]));
    await fireEvent.click(items()[1] as HTMLElement, { detail: 0 });
    expect(document.activeElement).toBe(field);
    field.remove();
  });

  it('after an Esc out of the menu, a keyboard press on Translate still puts focus back on the page', async () => {
    const field = document.createElement('textarea');
    document.body.append(field);
    field.focus();
    chevron().focus();
    await fireEvent.keyDown(chevron(), { key: 'ArrowDown' });
    await vi.waitFor(() => expect(getShadowRoot().activeElement).toBe(items()[0]));
    await fireEvent.keyDown(items()[0] as HTMLElement, { key: 'Escape' });
    const main = getShadowRoot().querySelector<HTMLButtonElement>('button.bubble');
    if (!main) throw new Error('no bubble');
    main.focus();
    await fireEvent.click(main, { detail: 0 });
    expect(document.activeElement).toBe(field);
    field.remove();
  });

  it('Bubble settings opens the Selection & picker tab', async () => {
    const send = chrome.runtime.sendMessage as unknown as Mock;
    openBubbleMenu(chevron(), { focusFirst: false, hideBubble });
    await fireEvent.click(items()[1] as HTMLElement);
    expect(send).toHaveBeenCalledWith({ kind: 'ui:open-options', tab: 'selection-bubble' });
  });

  describe('Run task', () => {
    const tasks = [
      { id: 'translate', label: 'Translate' },
      { id: 'summarize', label: 'Summarize' },
    ];
    const sub = (): HTMLElement | null =>
      getShadowRoot().querySelector<HTMLElement>('[role="menu"][aria-label="Run task"]');

    it('is left out when no task is on', () => {
      openBubbleMenu(chevron(), { focusFirst: false, hideBubble, tasks: [] });
      expect(items().map((i) => i.textContent)).toEqual([
        'Turn off on this site',
        'Bubble settings',
      ]);
    });

    it('ArrowRight opens the list on its first task, arrows stay inside it, ArrowLeft goes back', async () => {
      openBubbleMenu(chevron(), { focusFirst: true, hideBubble, tasks, onRunTask: () => {} });
      const parent = items()[0] as HTMLButtonElement;
      await vi.waitFor(() => expect(getShadowRoot().activeElement).toBe(parent));
      expect(parent.textContent).toBe('Run task');
      expect(parent.getAttribute('aria-expanded')).toBe('false');
      await fireEvent.keyDown(parent, { key: 'ArrowRight' });
      await vi.waitFor(() => expect(sub()).not.toBeNull());
      const [first, second] = [
        ...(sub()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
      ];
      expect(parent.getAttribute('aria-expanded')).toBe('true');
      await vi.waitFor(() => expect(getShadowRoot().activeElement).toBe(first));
      await fireEvent.keyDown(first as HTMLElement, { key: 'ArrowDown' });
      expect(getShadowRoot().activeElement).toBe(second);
      await fireEvent.keyDown(second as HTMLElement, { key: 'ArrowDown' });
      expect(getShadowRoot().activeElement).toBe(first);
      await fireEvent.keyDown(first as HTMLElement, { key: 'ArrowLeft' });
      expect(sub()).toBeNull();
      expect(getShadowRoot().activeElement).toBe(parent);
    });

    it('Esc in the list closes only the list', async () => {
      openBubbleMenu(chevron(), { focusFirst: true, hideBubble, tasks, onRunTask: () => {} });
      const parent = items()[0] as HTMLButtonElement;
      await fireEvent.click(parent, { detail: 0 });
      await vi.waitFor(() => expect(sub()).not.toBeNull());
      const first = sub()?.querySelector<HTMLElement>('[role="menuitem"]') as HTMLElement;
      await fireEvent.keyDown(first, { key: 'Escape' });
      expect(sub()).toBeNull();
      expect(getShadowRoot().activeElement).toBe(parent);
      expect(chevron().getAttribute('aria-expanded')).toBe('true');
    });

    it('a list on the left still opens with ArrowRight and closes with ArrowLeft', async () => {
      const group = chevron().closest('.bubble-group') as HTMLElement;
      group.getBoundingClientRect = () => ({ ...rect(), left: 900, right: 1000 }) as DOMRect;
      openBubbleMenu(chevron(), { focusFirst: true, hideBubble, tasks, onRunTask: () => {} });
      const parent = items()[0] as HTMLButtonElement;
      await vi.waitFor(() => expect(getShadowRoot().activeElement).toBe(parent));
      await fireEvent.keyDown(parent, { key: 'ArrowRight' });
      await vi.waitFor(() => expect(sub()).not.toBeNull());
      expect(sub()?.classList.contains('on-left')).toBe(true);
      const first = sub()?.querySelector<HTMLElement>('[role="menuitem"]') as HTMLElement;
      await vi.waitFor(() => expect(getShadowRoot().activeElement).toBe(first));
      await fireEvent.keyDown(first, { key: 'ArrowLeft' });
      expect(sub()).toBeNull();
      expect(getShadowRoot().activeElement).toBe(parent);
    });

    it('hovering another item while the list has focus puts focus on Run task', async () => {
      openBubbleMenu(chevron(), { focusFirst: true, hideBubble, tasks, onRunTask: () => {} });
      const parent = items()[0] as HTMLButtonElement;
      await fireEvent.keyDown(parent, { key: 'ArrowRight' });
      const first = await vi.waitFor(() => {
        const el = sub()?.querySelector<HTMLElement>('[role="menuitem"]');
        if (!el || getShadowRoot().activeElement !== el) throw new Error('list not focused');
        return el;
      });
      expect(first).toBeTruthy();
      const off = items().find((i) => i.textContent === 'Turn off on this site');
      await fireEvent.pointerEnter(off as HTMLElement);
      expect(sub()).toBeNull();
      expect(getShadowRoot().activeElement).toBe(parent);
    });

    it('a task runs that task, hides the bubble and puts keyboard focus back on the page', async () => {
      const run = vi.fn();
      const field = document.createElement('textarea');
      document.body.append(field);
      field.focus();
      chevron().focus();
      openBubbleMenu(chevron(), {
        focusFirst: true,
        hideBubble,
        returnTo: field,
        tasks,
        onRunTask: run,
      });
      await fireEvent.click(items()[0] as HTMLElement, { detail: 0 });
      await vi.waitFor(() => expect(sub()).not.toBeNull());
      const summarize = [...(sub()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])][1];
      summarize?.focus();
      await fireEvent.click(summarize as HTMLElement, { detail: 0 });
      expect(run).toHaveBeenCalledWith('summarize');
      expect(getShadowRoot().querySelector('.bubble')).toBeNull();
      expect(document.activeElement).toBe(field);
      field.remove();
    });
  });
});
