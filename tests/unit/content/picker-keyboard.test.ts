// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { createPicker } from '@/content/picker';
import { dismissToast } from '@/content/toast';

function press(key: string, init: KeyboardEventInit = {}): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  );
}

function el(id: string): Element {
  const node = document.getElementById(id);
  if (!node) throw new Error(`test setup: #${id}`);
  return node;
}

function lastHovered(onHover: Mock): Element | null {
  const call = onHover.mock.calls.at(-1);
  return call ? (call[0] as { element: Element }).element : null;
}

function mockPage(): void {
  document.body.innerHTML = `
    <main id="main">
      <p id="first">first para</p>
      <section id="mid"><p id="nested">nested text</p></section>
      <input id="pw" type="password" />
      <p id="last">last para</p>
    </main>
  `;
}

describe('picker keyboard path', () => {
  beforeEach(() => {
    dismissToast();
    document.querySelectorAll('#ega-shadow-host').forEach((n) => n.remove());
    document.body.innerHTML = '';
  });

  it('paints no outline until the user presses a navigation key', () => {
    mockPage();
    const onHover = vi.fn();
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn(), onHover });
    p.enter();
    expect(onHover).not.toHaveBeenCalled();
    p.exit();
  });

  it('the first arrow key starts the cursor at the top of the page', () => {
    mockPage();
    const onHover = vi.fn();
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn(), onHover });
    p.enter();
    press('ArrowDown');
    expect(lastHovered(onHover)).toBe(el('main'));
    p.exit();
  });

  it('ArrowDown walks into the first child, ArrowUp walks back to the parent', () => {
    mockPage();
    const onHover = vi.fn();
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn(), onHover });
    p.enter();
    press('ArrowDown');
    press('ArrowDown');
    expect(lastHovered(onHover)).toBe(el('first'));
    press('ArrowUp');
    expect(lastHovered(onHover)).toBe(el('main'));
    p.exit();
  });

  it('Tab moves to the next sibling and Shift+Tab moves back', () => {
    mockPage();
    const onHover = vi.fn();
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn(), onHover });
    p.enter();
    press('ArrowDown');
    press('ArrowDown');
    expect(lastHovered(onHover)).toBe(el('first'));
    press('Tab');
    expect(lastHovered(onHover)).toBe(el('mid'));
    press('Tab', { shiftKey: true });
    expect(lastHovered(onHover)).toBe(el('first'));
    p.exit();
  });

  it('Tab skips a password field', () => {
    mockPage();
    const onHover = vi.fn();
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn(), onHover });
    p.enter();
    press('ArrowDown');
    press('ArrowDown');
    press('Tab');
    press('Tab');
    expect(lastHovered(onHover)).toBe(el('last'));
    p.exit();
  });

  it('Enter picks the element under the cursor and exits', () => {
    mockPage();
    const onPick = vi.fn();
    const onExit = vi.fn();
    const p = createPicker({ onPick, onExit, onHover: vi.fn() });
    p.enter();
    press('ArrowDown');
    press('ArrowDown');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'first para', element: el('first') }),
    );
    expect(p.isActive()).toBe(false);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('Space picks the element under the cursor', () => {
    mockPage();
    const onPick = vi.fn();
    const p = createPicker({ onPick, onExit: vi.fn(), onHover: vi.fn() });
    p.enter();
    press('ArrowDown');
    press('ArrowDown');
    press(' ');
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ element: el('first') }));
    expect(p.isActive()).toBe(false);
  });

  it('Enter does nothing before the cursor exists', () => {
    mockPage();
    const onPick = vi.fn();
    const p = createPicker({ onPick, onExit: vi.fn(), onHover: vi.fn() });
    p.enter();
    press('Enter');
    expect(onPick).not.toHaveBeenCalled();
    expect(p.isActive()).toBe(true);
    p.exit();
  });

  it('a mouse hover moves the cursor, so Enter picks the hovered element', () => {
    mockPage();
    const onPick = vi.fn();
    const p = createPicker({ onPick, onExit: vi.fn(), onHover: vi.fn() });
    p.enter();
    el('last').dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    press('Enter');
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ element: el('last') }));
  });

  it('keeps the browser from acting on the keys it handles', () => {
    mockPage();
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn(), onHover: vi.fn() });
    p.enter();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    p.exit();
  });

  it('ignores keys after exit', () => {
    mockPage();
    const onHover = vi.fn();
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn(), onHover });
    p.enter();
    p.exit();
    press('ArrowDown');
    expect(onHover).not.toHaveBeenCalled();
  });

  it('does not walk above the body element', () => {
    mockPage();
    const onHover = vi.fn();
    const p = createPicker({ onPick: vi.fn(), onExit: vi.fn(), onHover });
    p.enter();
    press('ArrowDown');
    press('ArrowUp');
    press('ArrowUp');
    press('ArrowUp');
    expect(lastHovered(onHover)).toBe(document.body);
    p.exit();
  });
});
