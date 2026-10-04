// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import ResetField from '@/shared/ui/ResetField.svelte';

describe('ResetField', () => {
  it('renders nothing when differsFromInherited is false', () => {
    const { container } = render(ResetField, {
      props: {
        differsFromInherited: false,
        onReset: () => {},
        ariaLabel: 'Reset temperature to inherited',
      },
    });
    expect(container.querySelector('[data-ega-reset-field]')).toBeNull();
  });

  it('renders a button when differsFromInherited is true', () => {
    const { container } = render(ResetField, {
      props: {
        differsFromInherited: true,
        onReset: () => {},
        ariaLabel: 'Reset temperature to inherited',
      },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-reset-field]');
    expect(btn).toBeTruthy();
    expect(btn?.tagName).toBe('BUTTON');
  });

  it('onReset fires on button click', async () => {
    const onReset = vi.fn();
    const { container } = render(ResetField, {
      props: {
        differsFromInherited: true,
        onReset,
        ariaLabel: 'Reset temperature to inherited',
      },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-reset-field]');
    expect(btn).toBeTruthy();
    if (btn) await fireEvent.click(btn);
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('aria-label is wired', () => {
    const { container } = render(ResetField, {
      props: {
        differsFromInherited: true,
        onReset: () => {},
        ariaLabel: 'Reset temperature to inherited',
      },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-reset-field]');
    expect(btn?.getAttribute('aria-label')).toBe('Reset temperature to inherited');
  });

  it('inheritedLabel renders as a tooltip (data-tooltip attr)', () => {
    const { container } = render(ResetField, {
      props: {
        differsFromInherited: true,
        onReset: () => {},
        ariaLabel: 'Reset temperature to inherited',
        inheritedLabel: 'Inherits 0.30 from Global',
      },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-reset-field]');
    expect(btn?.getAttribute('data-tooltip')).toBe('Inherits 0.30 from Global');
    expect(btn?.getAttribute('title')).toBeNull();
  });
});
