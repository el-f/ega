// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Bubble from '@/content/Bubble.svelte';

const base = { left: 10, top: 20, queued: 0, onclick: vi.fn(), onmenu: vi.fn() };

describe('Bubble — label, click and menu button', () => {
  it.each([
    [{ source: 'auto', target: 'en' }, 0, 'Translate to English'],
    [{ source: 'arabizi', target: 'en' }, 0, 'Translate to English'],
    [{ source: 'en', target: 'he' }, 2, 'Translate 3 to Hebrew'],
  ])('names only the target, by name (%o, %i queued)', (direction, queued, label) => {
    const { getByRole } = render(Bubble, { props: { ...base, direction, queued } });
    const main = getByRole('button', { name: label });
    // The accessible name is the visible label, so a voice user can say what they see.
    expect(main.textContent.trim()).toBe(label);
    expect(main.hasAttribute('title')).toBe(false);
  });

  it('says Translate when no direction is known', () => {
    const { getByRole } = render(Bubble, { props: base });
    expect(getByRole('button', { name: 'Translate' })).toBeTruthy();
  });

  it('clicking the main segment fires onclick, not the menu', async () => {
    const onclick = vi.fn();
    const onmenu = vi.fn();
    const { getByRole } = render(Bubble, {
      props: { ...base, onclick, onmenu, direction: { source: 'en', target: 'es' } },
    });
    await fireEvent.click(getByRole('button', { name: 'Translate to Spanish' }));
    expect(onclick).toHaveBeenCalledTimes(1);
    expect(onmenu).not.toHaveBeenCalled();
  });

  it('the chevron is a menu button that opens the menu, by click or ArrowDown', async () => {
    const onclick = vi.fn();
    const onmenu = vi.fn();
    const { getByRole } = render(Bubble, { props: { ...base, onclick, onmenu } });
    const chevron = getByRole('button', { name: 'Bubble options' });
    expect(chevron.getAttribute('aria-haspopup')).toBe('menu');
    expect(chevron.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(chevron, { detail: 1 });
    expect(onmenu).toHaveBeenLastCalledWith(chevron, false);
    await fireEvent.keyDown(chevron, { key: 'ArrowDown' });
    expect(onmenu).toHaveBeenLastCalledWith(chevron, true);
    expect(onclick).not.toHaveBeenCalled();
  });

  it('mousedown is prevented on both segments so a form field keeps focus and its selection', () => {
    const { container } = render(Bubble, { props: base });
    for (const b of container.querySelectorAll('button')) {
      const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      b.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
    }
  });

  it('a keyboard press gives focus back to where it came from before the click runs', async () => {
    const field = document.createElement('textarea');
    document.body.appendChild(field);
    let focusedDuringClick: Element | null = null;
    const onclick = vi.fn(() => {
      focusedDuringClick = document.activeElement;
    });
    const { container } = render(Bubble, { props: { ...base, onclick } });
    const bubble = container.querySelector('button.bubble') as HTMLButtonElement;
    field.focus();
    bubble.focus();
    expect(document.activeElement).toBe(bubble);

    await fireEvent.click(bubble);

    // The click unmounts the bubble; the tooltip's focus restore reads what has focus when it opens.
    expect(focusedDuringClick).toBe(field);
    field.remove();
  });

  it('a mouse click leaves focus alone, even after a keyboard visit', async () => {
    const field = document.createElement('textarea');
    const other = document.createElement('input');
    document.body.append(field, other);
    const onclick = vi.fn();
    const { container } = render(Bubble, { props: { ...base, onclick } });
    const bubble = container.querySelector('button.bubble') as HTMLButtonElement;
    field.focus();
    bubble.focus();
    other.focus();
    // A real mouse click counts its presses; a keyboard one has detail 0.
    await fireEvent.click(bubble, { detail: 1 });
    expect(onclick).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(other);
    field.remove();
    other.remove();
  });
});
