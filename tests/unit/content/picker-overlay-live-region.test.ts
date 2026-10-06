// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import PickerOverlay from '@/content/PickerOverlay.svelte';
import PickerBar from '@/content/picker-bar/PickerBar.svelte';

describe('the picker bar both picker modes share', () => {
  it('is a toolbar named by its mode, with the status in a polite live region', () => {
    const { getByRole } = render(PickerBar, {
      props: { kind: 'pick', initialStatus: 'Click a block to translate it', onCancel: vi.fn() },
    });
    getByRole('toolbar', { name: 'Pick element' });
    expect(document.querySelector('[data-ega-ms-count]')?.textContent).toBe(
      'Click a block to translate it',
    );
    expect(document.querySelector('[data-ega-ms-count]')?.getAttribute('role')).toBe('status');
  });

  it('Cancel works by mouse, and the keys sit in a toggletip that holds no controls', async () => {
    const onCancel = vi.fn();
    const { getByRole, container } = render(PickerBar, {
      props: { kind: 'areas', initialStatus: 'Click blocks to choose them', onCancel },
    });
    await fireEvent.click(getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();

    const keys = getByRole('button', { name: 'Keys' });
    const tip = container.querySelector<HTMLElement>(
      `#${keys.getAttribute('aria-controls') ?? ''}`,
    );
    expect(tip?.hidden).toBe(true);
    await fireEvent.click(keys);
    expect(keys.getAttribute('aria-expanded')).toBe('true');
    expect(tip?.hidden).toBe(false);
    expect(tip?.querySelectorAll('button, a, input')).toHaveLength(0);
    expect(tip?.textContent).toContain('larger or smaller block');
    await fireEvent.keyDown(keys, { key: 'Escape' });
    expect(tip?.hidden).toBe(true);
  });

  it('Choose areas: the segments are a radio group, and Translate says why it is blocked', async () => {
    const onModeSelect = vi.fn();
    const onTranslate = vi.fn();
    const r = render(PickerBar, {
      props: {
        kind: 'areas',
        initialStatus: 'Click blocks to choose them',
        onCancel: vi.fn(),
        onModeSelect,
        onTranslate,
      },
    });
    const group = r.getByRole('radiogroup', { name: 'How to show the translation' });
    expect(r.getByRole('radio', { name: 'Replace text' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    await fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onModeSelect).toHaveBeenLastCalledWith('bilingual');
    expect(r.getByRole('radio', { name: 'Show both' }).getAttribute('aria-checked')).toBe('true');

    const translate = r.getByRole('button', { name: 'Translate' });
    expect(translate.getAttribute('aria-disabled')).toBe('true');
    expect(
      document.getElementById(translate.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Click blocks to choose them');
    await fireEvent.click(translate);
    expect(onTranslate).not.toHaveBeenCalled();
  });

  it('a refusal replaces the status for 4 s, then the status comes back', () => {
    vi.useFakeTimers();
    try {
      const r = render(PickerBar, {
        props: { kind: 'areas', initialStatus: 'Click blocks to choose them', onCancel: vi.fn() },
      });
      (r.component as unknown as { flash: (t: string) => void }).flash(
        'That area is already translated.',
      );
      flushSync();
      const status = document.querySelector('[data-ega-ms-count]');
      expect(status?.textContent).toBe('That area is already translated.');
      expect(status?.classList.contains('refusal')).toBe(true);
      vi.advanceTimersByTime(4000);
      flushSync();
      expect(status?.textContent).toBe('Click blocks to choose them');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('PickerOverlay', () => {
  it('ships the dimmer and a hidden outline so a hover never remounts the tree', () => {
    const { container } = render(PickerOverlay);
    expect(container.querySelector('.picker-dimmer')).not.toBeNull();
    const outline = container.querySelector<HTMLElement>('[data-ega-picker-outline]');
    expect(outline).not.toBeNull();
    expect(outline?.hidden).toBe(true);
  });
});
