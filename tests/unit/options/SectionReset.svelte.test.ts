// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import SectionReset from '@/options/components/SectionReset.svelte';

describe('SectionReset', () => {
  it('renders button with data-tooltip and data-tooltip-placement when modified', () => {
    const { container } = render(SectionReset, {
      props: {
        modified: true,
        onReset: vi.fn(),
        ariaLabel: 'Reset Display section',
      },
    });
    const btn = container.querySelector('[data-ega-section-reset]') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    if (!btn) throw new Error('button not found');
    expect(btn.getAttribute('data-tooltip')).toBe('Reset Display section');
    expect(btn.getAttribute('data-tooltip-placement')).toBe('top');
    expect(btn.getAttribute('aria-label')).toBe('Reset Display section');
  });

  it('does not render button when modified is false', () => {
    const { container } = render(SectionReset, {
      props: {
        modified: false,
        onReset: vi.fn(),
        ariaLabel: 'Reset Display section',
      },
    });
    expect(container.querySelector('[data-ega-section-reset]')).toBeNull();
  });
});
