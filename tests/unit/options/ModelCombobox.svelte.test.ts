// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ModelCombobox from '@/options/components/ModelCombobox.svelte';

// Queries the rendered input directly; a data-testid would couple to bits-ui internals.

describe('ModelCombobox', () => {
  function getInput(container: HTMLElement): HTMLInputElement {
    const input = container.querySelector('.ega-combobox-input') as HTMLInputElement | null;
    if (!input) throw new Error('combobox input not found');
    return input;
  }

  it('renders the saved value as the initial input text', () => {
    const { container } = render(ModelCombobox, {
      props: {
        value: 'gpt-4o',
        options: [],
        onValueChange: vi.fn(),
        onDiscover: vi.fn(),
      },
    });
    expect(getInput(container).value).toBe('gpt-4o');
  });

  it('typing into the input fires onValueChange per keystroke', async () => {
    const onValueChange = vi.fn();
    const { container } = render(ModelCombobox, {
      props: {
        value: '',
        options: [],
        onValueChange,
        onDiscover: vi.fn(),
      },
    });
    const input = getInput(container);
    await fireEvent.input(input, { target: { value: 'gpt' } });
    expect(onValueChange).toHaveBeenCalledWith('gpt');
    await fireEvent.input(input, { target: { value: 'gpt-' } });
    expect(onValueChange).toHaveBeenLastCalledWith('gpt-');
  });

  it('refresh button triggers onDiscover', async () => {
    const onDiscover = vi.fn();
    const { getByRole } = render(ModelCombobox, {
      props: {
        value: 'gpt-4o',
        options: [],
        onValueChange: vi.fn(),
        onDiscover,
      },
    });
    const btn = getByRole('button', { name: /Refresh model list/i });
    await fireEvent.click(btn);
    expect(onDiscover).toHaveBeenCalledTimes(1);
  });

  it('refresh button reflects loading state in its aria-label', () => {
    const { getByRole } = render(ModelCombobox, {
      props: {
        value: '',
        options: [],
        loading: true,
        onValueChange: vi.fn(),
        onDiscover: vi.fn(),
      },
    });
    expect(getByRole('button', { name: /Loading models/i })).toBeTruthy();
  });

  it('a blocked refresh stays focusable, says why, and runs nothing', async () => {
    const onDiscover = vi.fn();
    const { getByRole } = render(ModelCombobox, {
      props: {
        value: '',
        options: [],
        refreshBlockedBy: 'why',
        onValueChange: vi.fn(),
        onDiscover,
      },
    });
    const btn = getByRole('button', { name: /Refresh model list/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.getAttribute('aria-describedby')).toBe('why');
    await fireEvent.click(btn);
    expect(onDiscover).not.toHaveBeenCalled();
  });

  it('an empty value shows the fallback, and a field the user empties stays empty until focus leaves', async () => {
    const onValueChange = vi.fn();
    const { container, rerender } = render(ModelCombobox, {
      props: {
        value: 'gpt-4o',
        fallback: 'gpt-4o-mini',
        options: [],
        onValueChange,
        onDiscover: vi.fn(),
      },
    });
    const input = getInput(container);
    await fireEvent.input(input, { target: { value: '' } });
    await rerender({ value: '' });
    expect(input.value).toBe('');
    await fireEvent.focusOut(input);
    await tick();
    expect(input.value).toBe('gpt-4o-mini');
  });

  it('renders the inline error block when error prop is set', async () => {
    const { container } = render(ModelCombobox, {
      props: {
        value: '',
        options: [],
        error: 'Discovery failed: HTTP 401',
        onValueChange: vi.fn(),
        onDiscover: vi.fn(),
      },
    });
    await tick();
    const err = container.querySelector('.ega-combobox-error');
    expect(err?.textContent).toContain('HTTP 401');
  });

  it('renders without an error block when error is null', async () => {
    const { container } = render(ModelCombobox, {
      props: {
        value: '',
        options: [],
        error: null,
        onValueChange: vi.fn(),
        onDiscover: vi.fn(),
      },
    });
    await tick();
    expect(container.querySelector('.ega-combobox-error')).toBeNull();
  });

  it('renders the visible label when label prop is set', () => {
    const { getByText } = render(ModelCombobox, {
      props: {
        value: '',
        label: 'Default model',
        options: [],
        onValueChange: vi.fn(),
        onDiscover: vi.fn(),
      },
    });
    expect(getByText('Default model')).toBeTruthy();
  });

  it('uses the supplied placeholder', () => {
    const { container } = render(ModelCombobox, {
      props: {
        value: '',
        placeholder: 'gpt-4o',
        options: [],
        onValueChange: vi.fn(),
        onDiscover: vi.fn(),
      },
    });
    expect(getInput(container).placeholder).toBe('gpt-4o');
  });
});
