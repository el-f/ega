// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SettingsSearch from '@/options/components/SettingsSearch.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';

describe('SettingsSearch — clearable search input', () => {
  it('shows a clear (X) button once the query has text', async () => {
    const { container, getByPlaceholderText } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    // No text yet → no clear button.
    expect(container.querySelector('.ega-input-clear')).toBeNull();
    const input = getByPlaceholderText('Search settings…') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'cache' } });
    expect(container.querySelector('.ega-input-clear')).not.toBeNull();
  });

  it('clicking the clear button empties the query', async () => {
    const { container, getByPlaceholderText } = render(SettingsSearch, {
      props: {
        open: true,
        settings: DEFAULT_SETTINGS,
        onClose: () => {},
        onJump: () => {},
      },
    });
    const input = getByPlaceholderText('Search settings…') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'cache' } });
    const clear = container.querySelector('.ega-input-clear');
    if (!clear) throw new Error('clear button missing');
    await fireEvent.click(clear);
    expect((getByPlaceholderText('Search settings…') as HTMLInputElement).value).toBe('');
  });
});
