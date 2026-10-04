// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { preset, sel } from '@tests/_helpers/lang';
import { render, fireEvent } from '@testing-library/svelte';
import PopupLangPair from '@/popup/PopupLangPair.svelte';
import type { Variety } from '@/shared/types';

const varieties: Variety[] = [
  {
    id: preset('en'),
    label: 'English',
    hint: '',
    examples: [],
    kind: 'builtin',
    disabled: false,
    hasOverrides: false,
  },
  {
    id: preset('fr'),
    label: 'French',
    hint: '',
    examples: [],
    kind: 'builtin',
    disabled: false,
    hasOverrides: false,
  },
];

describe('PopupLangPair', () => {
  const base = {
    sourceLang: 'auto',
    targetLang: sel('en'),
    varieties,
    onSourceChange: vi.fn(),
    onTargetChange: vi.fn(),
    onSwap: vi.fn(),
  };

  it('renders two LanguagePicker dropdowns', () => {
    const { container } = render(PopupLangPair, { props: base });
    const selects = container.querySelectorAll('select');
    expect(selects.length).toBe(2);
  });

  it('renders a swap button between pickers', () => {
    const { getByRole } = render(PopupLangPair, { props: base });
    expect(getByRole('button', { name: /Swap languages/ })).toBeTruthy();
  });

  it('swap button fires onSwap', async () => {
    const onSwap = vi.fn();
    const { getByRole } = render(PopupLangPair, { props: { ...base, onSwap } });
    await fireEvent.click(getByRole('button', { name: /Swap languages/ }));
    expect(onSwap).toHaveBeenCalled();
  });

  it('blocks the swap when swapDisabled is set (source = auto), but keeps it focusable with its reason', async () => {
    const onSwap = vi.fn();
    const { getByRole } = render(PopupLangPair, {
      props: { ...base, swapDisabled: true, onSwap },
    });
    const swap = getByRole('button', {
      name: 'Pick a source language to swap',
    }) as HTMLButtonElement;
    expect(swap.disabled).toBe(false);
    expect(swap.getAttribute('aria-disabled')).toBe('true');
    await fireEvent.click(swap);
    expect(onSwap).not.toHaveBeenCalled();
  });

  it('routes each picker change to its own callback', async () => {
    const onSourceChange = vi.fn();
    const onTargetChange = vi.fn();
    const { container } = render(PopupLangPair, {
      props: { ...base, onSourceChange, onTargetChange },
    });
    const selects = container.querySelectorAll<HTMLSelectElement>('select');
    const [source, target] = [selects[0], selects[1]] as [HTMLSelectElement, HTMLSelectElement];
    await fireEvent.change(source, { target: { value: 'de' } });
    expect(onSourceChange).toHaveBeenCalledWith('de');
    expect(onTargetChange).not.toHaveBeenCalled();
    await fireEvent.change(target, { target: { value: 'de' } });
    expect(onTargetChange).toHaveBeenCalledWith('de');
  });

  it('stamps data-ega-lang-pair marker', () => {
    const { container } = render(PopupLangPair, { props: base });
    expect(container.querySelector('[data-ega-lang-pair]')).not.toBeNull();
  });
});
