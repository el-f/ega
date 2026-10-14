// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { Copy } from '@lucide/svelte';
import IconButton from '@/shared/ui/IconButton.svelte';

describe('IconButton', () => {
  it('renders an icon', () => {
    const { container } = render(IconButton, {
      props: { icon: Copy, ariaLabel: 'Copy' },
    });
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('requires aria-label for a11y', () => {
    const { getByRole } = render(IconButton, {
      props: { icon: Copy, ariaLabel: 'Copy result' },
    });
    expect(getByRole('button').getAttribute('aria-label')).toBe('Copy result');
  });

  it('applies md size by default (32px)', () => {
    const { getByRole } = render(IconButton, {
      props: { icon: Copy, ariaLabel: 'x' },
    });
    expect(getByRole('button').classList.contains('size-md')).toBe(true);
  });

  // Bits UI Tooltip is the single source. CSS data-tooltip pseudo was
  // removed to stop the double-tooltip render on hover.
  it('does not stamp data-tooltip on the trigger (Bits UI owns hover)', () => {
    const { getByRole } = render(IconButton, {
      props: { icon: Copy, ariaLabel: 'Copy', tooltip: 'Copy to clipboard' },
    });
    expect(getByRole('button').getAttribute('data-tooltip')).toBeNull();
  });

  it('opts out of Bits UI tooltip when tooltip="" — renders bare button', () => {
    const { getByRole } = render(IconButton, {
      props: { icon: Copy, ariaLabel: 'Copy', tooltip: '' },
    });
    expect(getByRole('button').getAttribute('aria-label')).toBe('Copy');
  });

  it('uses the compact and large icon sizes', () => {
    const small = render(IconButton, {
      props: { icon: Copy, ariaLabel: 'Small copy', tooltip: '', size: 'sm' },
    });
    expect(small.getByRole('button').classList.contains('size-sm')).toBe(true);
    expect(small.container.querySelector('svg')?.getAttribute('width')).toBe('16');
    small.unmount();

    const large = render(IconButton, {
      props: { icon: Copy, ariaLabel: 'Large copy', tooltip: '', size: 'lg' },
    });
    expect(large.getByRole('button').classList.contains('size-lg')).toBe(true);
    expect(large.container.querySelector('svg')?.getAttribute('width')).toBe('24');
  });

  it('fires onclick', async () => {
    let clicked = false;
    const { getByRole } = render(IconButton, {
      props: {
        icon: Copy,
        ariaLabel: 'x',
        onclick: () => {
          clicked = true;
        },
      },
    });
    await fireEvent.click(getByRole('button'));
    expect(clicked).toBe(true);
  });
});
