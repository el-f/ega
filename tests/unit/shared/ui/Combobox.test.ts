// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Combobox from '@/shared/ui/Combobox.svelte';
import { textSnippet } from './_helpers';

function props(over: Record<string, unknown> = {}) {
  return {
    value: '',
    inputValue: '',
    inputId: 'model-input',
    triggerAriaLabel: 'Show model list',
    items: textSnippet('gpt-4o'),
    onValueChange: vi.fn(),
    oninput: vi.fn(),
    ...over,
  };
}

describe('Combobox — a field that cannot be used yet (R1-08, K-5)', () => {
  it('stays in the Tab order and points at the visible reason', () => {
    const { container } = render(Combobox, {
      props: props({ ariaDisabled: true, describedById: 'cp-model-why-groq' }),
    });
    const input = container.querySelector<HTMLInputElement>('#model-input');
    expect(input?.disabled).toBe(false);
    expect(input?.getAttribute('aria-disabled')).toBe('true');
    expect(input?.readOnly).toBe(true);
    expect(input?.getAttribute('aria-describedby')).toBe('cp-model-why-groq');
  });

  it('never opens its list from the keyboard', async () => {
    const { container } = render(Combobox, { props: props({ ariaDisabled: true }) });
    const input = container.querySelector<HTMLInputElement>('#model-input');
    if (!input) throw new Error('no input');
    input.focus();
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(document.querySelector('.ega-combobox-content')).toBeNull();
  });

  it('never opens its list from the chevron', async () => {
    const { getByRole } = render(Combobox, { props: props({ ariaDisabled: true }) });
    await fireEvent.pointerDown(getByRole('button', { name: 'Show model list' }), {
      pointerType: 'mouse',
    });
    expect(document.querySelector('.ega-combobox-content')).toBeNull();
  });

  it('opens its list when it can be used (positive control)', async () => {
    const { container } = render(Combobox, { props: props() });
    const input = container.querySelector<HTMLInputElement>('#model-input');
    if (!input) throw new Error('no input');
    input.focus();
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(document.querySelector('.ega-combobox-content')).not.toBeNull();
  });

  it('looks unavailable, not editable, whether natively or aria-disabled', () => {
    for (const over of [{ disabled: true }, { ariaDisabled: true }]) {
      const { container, unmount } = render(Combobox, { props: props(over) });
      expect(container.querySelector('.ega-combobox')?.classList.contains('is-disabled')).toBe(
        true,
      );
      unmount();
    }
  });
});
