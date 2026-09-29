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
    expect(container.querySelector('.direction')?.textContent.trim()).toContain('en→es');
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
