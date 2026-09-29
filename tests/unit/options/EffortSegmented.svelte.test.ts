// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import EffortSegmented from '@/options/components/EffortSegmented.svelte';

type Effort = 'low' | 'medium' | 'high';

function setup(value: Effort) {
  const onchange = vi.fn();
  const view = render(EffortSegmented, { props: { value, onchange, ariaLabel: 'Effort' } });
  const option = (v: Effort): HTMLButtonElement => {
    const el = view.container.querySelector<HTMLButtonElement>(`[data-ega-effort-value="${v}"]`);
    if (!el) throw new Error(`option ${v} missing`);
    return el;
  };
  return { ...view, onchange, option };
}

describe('EffortSegmented', () => {
  it('is a named radio group of Low, Medium, High with the value checked and the only Tab stop', () => {
    const { getByRole, getAllByRole } = setup('medium');
    expect(getByRole('radiogroup', { name: 'Effort' })).toBeTruthy();
    const radios = getAllByRole('radio');
    expect(radios.map((r) => r.textContent.trim())).toEqual(['Low', 'Medium', 'High']);
    expect(radios.map((r) => r.getAttribute('data-ega-effort-value'))).toEqual([
      'low',
      'medium',
      'high',
    ]);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    expect(radios.map((r) => r.classList.contains('active'))).toEqual([false, true, false]);
  });

  it('a click on another option reports it; a click on the current one does not', async () => {
    const { option, onchange } = setup('low');
    await fireEvent.click(option('low'));
    expect(onchange).not.toHaveBeenCalled();
    await fireEvent.click(option('high'));
    expect(onchange).toHaveBeenCalledTimes(1);
    expect(onchange).toHaveBeenCalledWith('high');
  });

  it('stays controlled: the checked option follows the value prop, not the click', async () => {
    const { option, rerender } = setup('low');
    await fireEvent.click(option('high'));
    expect(option('low').getAttribute('aria-checked')).toBe('true');
    expect(option('high').getAttribute('aria-checked')).toBe('false');
    await rerender({ value: 'high' });
    expect(option('high').getAttribute('aria-checked')).toBe('true');
    expect(option('high').tabIndex).toBe(0);
    expect(option('low').tabIndex).toBe(-1);
  });

  it.each([
    ['ArrowRight', 'medium', 'high'],
    ['ArrowDown', 'medium', 'high'],
    ['ArrowLeft', 'medium', 'low'],
    ['ArrowUp', 'medium', 'low'],
    ['ArrowRight', 'high', 'low'],
    ['ArrowLeft', 'low', 'high'],
    // Both starts per key: from one alone, Home or End matches a wrapping arrow.
    ['Home', 'medium', 'low'],
    ['Home', 'high', 'low'],
    ['End', 'medium', 'high'],
    ['End', 'low', 'high'],
  ] as const)('%s from %s selects and focuses %s', async (key, from, to) => {
    const { option, onchange } = setup(from);
    option(from).focus();
    await fireEvent.keyDown(option(from), { key });
    await tick();
    expect(onchange).toHaveBeenCalledTimes(1);
    expect(onchange).toHaveBeenCalledWith(to);
    expect(document.activeElement).toBe(option(to));
  });
});
