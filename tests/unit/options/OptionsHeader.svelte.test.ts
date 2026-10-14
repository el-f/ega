// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import OptionsHeader from '@/options/OptionsHeader.svelte';

describe('OptionsHeader', () => {
  it('mounts with brand mark + search button + theme toggle', () => {
    const { container } = render(OptionsHeader, {
      props: { theme: 'system', onOpenSearch: vi.fn(), onSetTheme: vi.fn() },
    });
    expect(container.querySelector('.options-title')).not.toBeNull();
    expect(container.querySelector('.search-button')).not.toBeNull();
  });

  it('search button click fires onOpenSearch', async () => {
    const onOpenSearch = vi.fn();
    const { container } = render(OptionsHeader, {
      props: { theme: 'system', onOpenSearch, onSetTheme: vi.fn() },
    });
    const btn = container.querySelector('.search-button') as HTMLButtonElement;
    await fireEvent.click(btn);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it('exposes modifier label (mac=⌘, other=Ctrl) in the kbd hint', () => {
    const { container } = render(OptionsHeader, {
      props: { theme: 'system', onOpenSearch: vi.fn(), onSetTheme: vi.fn() },
    });
    const kbd = container.querySelector('.search-kbd-group');
    expect(kbd?.textContent).toMatch(/⌘|Ctrl/);
  });
});
