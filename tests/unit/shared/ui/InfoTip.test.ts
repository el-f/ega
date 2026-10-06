// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import InfoTip from '@/shared/ui/InfoTip.svelte';

const TEXT = 'Chrome shows only the items that match what you right-click.';

function setup() {
  const view = render(InfoTip, { props: { label: 'About the menu', text: TEXT } });
  const button = view.getByRole('button', { name: 'About the menu' });
  const bubble = (): Element | null => document.querySelector('[data-ega-infotip-text]');
  return { ...view, button, bubble };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('InfoTip — the (i) toggletip', () => {
  it('is a real button whose text is read even while closed', () => {
    const { button, bubble } = setup();
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const described = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toBe(TEXT);
    expect(bubble()).toBeNull();
  });

  it('opens on click and a second click closes it', async () => {
    const { button, bubble } = setup();
    await fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(bubble()?.textContent.trim()).toBe(TEXT));
    await fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens on keyboard focus and closes on Esc', async () => {
    const { button } = setup();
    button.focus();
    await waitFor(() => expect(button.getAttribute('aria-expanded')).toBe('true'));
    await fireEvent.keyDown(button, { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens on hover after a short delay, so a passing pointer does not flash it', async () => {
    vi.useFakeTimers();
    const { button } = setup();
    await fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await vi.advanceTimersByTimeAsync(300);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    await fireEvent.pointerLeave(button, { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(150);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('a click pins it: moving the pointer away does not close it', async () => {
    vi.useFakeTimers();
    const { button } = setup();
    await fireEvent.click(button);
    await fireEvent.pointerLeave(button, { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(500);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('a tap pins it: the leave a touch sends before the click does not close it', async () => {
    vi.useFakeTimers();
    const { button } = setup();
    // A tap: enter, leave on lift, then focus and click.
    await fireEvent.pointerEnter(button, { pointerType: 'touch' });
    await fireEvent.pointerLeave(button, { pointerType: 'touch' });
    button.focus();
    await fireEvent.click(button);
    await vi.advanceTimersByTimeAsync(500);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('one Esc closes only the tip, even when focus sits in a layer under it', async () => {
    const outer = vi.fn();
    const field = document.createElement('input');
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') outer();
    });
    document.body.append(field);
    try {
      const { button } = setup();
      await fireEvent.click(button);
      field.focus();
      await fireEvent.keyDown(field, { key: 'Escape' });
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(outer).not.toHaveBeenCalled();
      // The next Esc reaches the layer under it.
      await fireEvent.keyDown(field, { key: 'Escape' });
      expect(outer).toHaveBeenCalledOnce();
    } finally {
      field.remove();
    }
  });
});
