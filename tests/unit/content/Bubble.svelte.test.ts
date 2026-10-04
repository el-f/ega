// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Bubble from '@/content/Bubble.svelte';

describe('Bubble — indicator + click', () => {
  it('renders a single button without direction when prop is absent', () => {
    const onclick = vi.fn();
    const { container } = render(Bubble, {
      props: { left: 10, top: 20, queued: 0, onclick },
    });
    const buttons = container.querySelectorAll('button.bubble');
    expect(buttons.length).toBe(1);
    expect(container.querySelector('.direction')).toBeNull();
    expect(container.querySelector('button[aria-label="Swap direction"]')).toBeNull();
  });

  it('renders the direction tag when direction is passed', () => {
    const onclick = vi.fn();
    const { container } = render(Bubble, {
      props: {
        left: 10,
        top: 20,
        queued: 0,
        direction: { source: 'en', target: 'es' },
        onclick,
      },
    });
    expect(container.querySelector('.direction')?.textContent.trim()).toBe('English → Spanish');
  });

  it.each([
    [{ source: 'auto', target: 'en' }, '→ English'],
    [{ source: 'arabizi', target: 'en' }, 'Arabizi → English'],
    [{ source: 'other', target: 'he' }, 'other → Hebrew'],
  ])('names the languages, never the raw ids: %o', (direction, text) => {
    const { container } = render(Bubble, {
      props: { left: 10, top: 20, queued: 0, direction, onclick: vi.fn() },
    });
    expect(container.querySelector('.direction')?.textContent.trim()).toBe(text);
  });

  it('clicking the bubble fires onclick', async () => {
    const onclick = vi.fn();
    const { container } = render(Bubble, {
      props: {
        left: 10,
        top: 20,
        queued: 0,
        direction: { source: 'en', target: 'es' },
        onclick,
      },
    });
    const bubble = container.querySelector('button.bubble') as HTMLButtonElement;
    await fireEvent.click(bubble);
    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('mousedown is prevented so a form field keeps focus and its selection', () => {
    const onclick = vi.fn();
    const { container } = render(Bubble, {
      props: { left: 10, top: 20, queued: 0, onclick },
    });
    const bubble = container.querySelector('button.bubble') as HTMLButtonElement;
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    bubble.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onclick).not.toHaveBeenCalled();
  });

  it('names the action for a screen reader, not just the brand', async () => {
    const onclick = vi.fn();
    const { getByRole, rerender } = render(Bubble, {
      props: { left: 10, top: 20, queued: 0, direction: { source: 'en', target: 'es' }, onclick },
    });
    expect(getByRole('button', { name: 'Translate with Ega' })).toBeTruthy();
    await rerender({ left: 10, top: 20, queued: 2, onclick });
    const queuedBtn = getByRole('button', { name: 'Translate with Ega' });
    // The count rides in the description, which a screen reader reads after the name.
    expect(queuedBtn.getAttribute('title')).toBe('2 queued. Shift-click to queue more');
  });

  it('a keyboard press gives focus back to where it came from before the click runs', async () => {
    const field = document.createElement('textarea');
    document.body.appendChild(field);
    let focusedDuringClick: Element | null = null;
    const onclick = vi.fn(() => {
      focusedDuringClick = document.activeElement;
    });
    const { container } = render(Bubble, { props: { left: 10, top: 20, queued: 0, onclick } });
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
    const { container } = render(Bubble, { props: { left: 10, top: 20, queued: 0, onclick } });
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

  it('renders queued badge when queued > 0', () => {
    const onclick = vi.fn();
    const { container } = render(Bubble, {
      props: { left: 10, top: 20, queued: 3, onclick },
    });
    const badge = container.querySelector('.badge');
    expect(badge?.textContent).toContain('+3');
  });

  it('no sibling .swap button renders even when direction is present', () => {
    const onclick = vi.fn();
    const { container } = render(Bubble, {
      props: {
        left: 10,
        top: 20,
        queued: 0,
        direction: { source: 'en', target: 'es' },
        onclick,
      },
    });
    expect(container.querySelector('button.bubble.swap')).toBeNull();
    expect(container.querySelectorAll('button.bubble').length).toBe(1);
  });
});
