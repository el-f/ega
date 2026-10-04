// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ShortcutInput from '@/shared/components/ShortcutInput.svelte';

/** The caption is a <span>, not <label for>: a label on the Record button would start recording on a caption click. */
describe('ShortcutInput — label prop', () => {
  it('renders the visible caption (non-label) and keeps the button aria-label', () => {
    const { container, getByRole } = render(ShortcutInput, {
      props: {
        value: '',
        ariaLabel: 'Record keyboard shortcut',
        label: 'Translate shortcut',
        onchange: vi.fn(),
      },
    });
    const caption = container.querySelector('.shortcut-label');
    expect(caption).not.toBeNull();
    expect(caption?.textContent.trim()).toBe('Translate shortcut');
    // Not a <label> — so it can't proxy clicks to the button.
    expect(container.querySelector('label')).toBeNull();
    // Button's accessible name comes from ariaLabel, not the caption.
    const btn = getByRole('button', { name: 'Record keyboard shortcut' });
    expect(btn).toBeTruthy();
  });

  it('omits the caption when label prop is absent', () => {
    const { container, getByRole } = render(ShortcutInput, {
      props: {
        value: '',
        ariaLabel: 'Record keyboard shortcut',
        onchange: vi.fn(),
      },
    });
    expect(container.querySelector('.shortcut-label')).toBeNull();
    const btn = getByRole('button', { name: 'Record keyboard shortcut' });
    expect(btn).toBeTruthy();
  });

  it('clicking the caption does NOT start recording', async () => {
    const { container } = render(ShortcutInput, {
      props: {
        value: '',
        ariaLabel: 'Record keyboard shortcut',
        label: 'Translate shortcut',
        onchange: vi.fn(),
      },
    });
    const caption = container.querySelector('.shortcut-label') as HTMLElement;
    const btn = container.querySelector('button.record-btn') as HTMLButtonElement;
    expect(btn.textContent.trim()).toBe('Record');

    await fireEvent.click(caption);

    // Caption is inert: button stays idle, no recording started.
    expect(btn.textContent.trim()).toBe('Record');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking the Record button itself toggles recording', async () => {
    const { container } = render(ShortcutInput, {
      props: {
        value: '',
        ariaLabel: 'Record keyboard shortcut',
        label: 'Translate shortcut',
        onchange: vi.fn(),
      },
    });
    const btn = container.querySelector('button.record-btn') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    await fireEvent.click(btn);

    expect(btn.textContent.trim()).toBe('Cancel');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('ShortcutInput — clear button aria-label', () => {
  it('defaults the Clear button name to "Clear shortcut"', () => {
    const { getByRole } = render(ShortcutInput, {
      props: {
        value: 'Ctrl+Shift+L',
        ariaLabel: 'Record keyboard shortcut',
        onchange: vi.fn(),
      },
    });
    expect(getByRole('button', { name: 'Clear shortcut' })).toBeTruthy();
  });

  it('uses clearAriaLabel for the Clear button when provided', () => {
    const { getByRole } = render(ShortcutInput, {
      props: {
        value: 'Ctrl+Shift+L',
        ariaLabel: 'Record element picker shortcut',
        clearAriaLabel: 'Clear element picker shortcut',
        onchange: vi.fn(),
      },
    });
    expect(getByRole('button', { name: 'Clear element picker shortcut' })).toBeTruthy();
  });
});

describe('ShortcutInput — empty-shortcut hint', () => {
  it('shows "No shortcut set" when the value is empty', () => {
    const { container } = render(ShortcutInput, {
      props: {
        value: '',
        ariaLabel: 'Record keyboard shortcut',
        onchange: vi.fn(),
      },
    });
    const hint = container.querySelector('.empty-hint');
    expect(hint).not.toBeNull();
    expect(hint?.textContent.trim()).toBe('No shortcut set');
  });

  it('hides the empty hint when a value is set', () => {
    const { container } = render(ShortcutInput, {
      props: {
        value: 'Ctrl+Shift+L',
        ariaLabel: 'Record keyboard shortcut',
        onchange: vi.fn(),
      },
    });
    expect(container.querySelector('.empty-hint')).toBeNull();
  });
});

describe('ShortcutInput — modified dot', () => {
  it('renders the modified dot inside the caption when modified=true', () => {
    const { container } = render(ShortcutInput, {
      props: {
        value: 'Ctrl+Shift+K',
        ariaLabel: 'Record keyboard shortcut',
        label: 'Translate shortcut',
        modified: true,
        onchange: vi.fn(),
      },
    });
    const dot = container.querySelector('.shortcut-label [data-ega-modified="true"]');
    expect(dot).not.toBeNull();
  });

  it('does not render the modified dot when modified=false', () => {
    const { container } = render(ShortcutInput, {
      props: {
        value: 'Ctrl+Shift+L',
        ariaLabel: 'Record keyboard shortcut',
        label: 'Translate shortcut',
        modified: false,
        onchange: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-modified="true"]')).toBeNull();
  });

  it('does not render the modified dot when modified is unset', () => {
    const { container } = render(ShortcutInput, {
      props: {
        value: 'Ctrl+Shift+L',
        ariaLabel: 'Record keyboard shortcut',
        label: 'Translate shortcut',
        onchange: vi.fn(),
      },
    });
    expect(container.querySelector('[data-ega-modified="true"]')).toBeNull();
  });
});
