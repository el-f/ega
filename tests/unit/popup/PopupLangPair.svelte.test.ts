// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { preset, sel } from '@tests/_helpers/lang';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
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

  it('labels the pair as the default languages', () => {
    const { getByRole } = render(PopupLangPair, { props: base });
    expect(getByRole('group', { name: 'Default languages' })).toBeTruthy();
  });

  it('keeps swap on screen but off while From is Auto-detect, says why, and does nothing (R63)', async () => {
    const onSwap = vi.fn();
    const { getByRole } = render(PopupLangPair, { props: { ...base, onSwap } });
    // On screen, so the pickers keep their width and no hole opens between them.
    const swap = getByRole('button', {
      name: 'Swap languages (needs a source language, not Auto-detect)',
    });
    expect(swap.getAttribute('aria-disabled')).toBe('true');
    expect(swap.hasAttribute('disabled')).toBe(false);
    await fireEvent.click(swap);
    expect(onSwap).not.toHaveBeenCalled();
    const source = readFileSync('src/popup/PopupLangPair.svelte', 'utf8');
    expect(source).toMatch(
      /\.popup-lang-pair \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\);/,
    );
  });

  // One wording: the hint shows the name, so a screen reader does not hear the reason twice in two forms.
  it('the off swap hint repeats its name, and the off look comes from IconButton', async () => {
    const { getByRole } = render(PopupLangPair, { props: base });
    const name = 'Swap languages (needs a source language, not Auto-detect)';
    await fireEvent.focus(getByRole('button', { name }));
    await waitFor(() =>
      expect(document.querySelector('.ega-icon-btn-tooltip')?.textContent.trim()).toBe(name),
    );
    expect(readFileSync('src/popup/PopupLangPair.svelte', 'utf8')).not.toMatch(
      /aria-disabled='true'\]/,
    );
  });

  it('swap button fires onSwap', async () => {
    const onSwap = vi.fn();
    const { getByRole } = render(PopupLangPair, {
      props: { ...base, sourceLang: sel('fr'), onSwap },
    });
    await fireEvent.click(getByRole('button', { name: 'Swap languages' }));
    expect(onSwap).toHaveBeenCalled();
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
