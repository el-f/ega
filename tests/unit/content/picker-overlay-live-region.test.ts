// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import PickerOverlay from '@/content/PickerOverlay.svelte';

describe('PickerOverlay — picker hint live region', () => {
  it('hint announces to screen readers via role=status + aria-live=polite', () => {
    const { container } = render(PickerOverlay);
    const hint = container.querySelector('.picker-hint');
    expect(hint).not.toBeNull();
    expect(hint?.getAttribute('role')).toBe('status');
    expect(hint?.getAttribute('aria-live')).toBe('polite');
    // Hint must not be hidden from the accessibility tree.
    expect(hint?.getAttribute('aria-hidden')).toBeNull();
  });

  it('hint teaches both the mouse and the keyboard path', () => {
    const { container } = render(PickerOverlay);
    const hint = container.querySelector('.picker-hint');
    const text = hint?.textContent.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('Click or use arrow keys + Enter to translate');
    expect(text).toContain('Esc');
  });

  it('ships the dimmer and a hidden outline so a hover never remounts the tree', () => {
    const { container } = render(PickerOverlay);
    expect(container.querySelector('.picker-dimmer')).not.toBeNull();
    const outline = container.querySelector<HTMLElement>('[data-ega-picker-outline]');
    expect(outline).not.toBeNull();
    expect(outline?.hidden).toBe(true);
  });
});
