// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import BatchProgress from '@/content/BatchProgress.svelte';

describe('BatchProgress component', () => {
  it('renders the running count and total', () => {
    const { container } = render(BatchProgress, {
      props: { done: 3, total: 12, liveMessage: 'Translating 12 paragraphs…', onCancel: () => {} },
    });
    const label = container.querySelector('.label');
    expect(label?.textContent).toMatch(/3.*12/);
  });

  it('carries role=status + aria-live=polite on the sr-only announcement region', () => {
    const { container } = render(BatchProgress, {
      props: { done: 0, total: 5, liveMessage: 'Translating 5 paragraphs…', onCancel: () => {} },
    });
    const live = container.querySelector('[data-ega-batch-live]');
    expect(live?.getAttribute('role')).toBe('status');
    expect(live?.getAttribute('aria-live')).toBe('polite');
    expect(live?.textContent).toBe('Translating 5 paragraphs…');
  });

  it('fires onCancel when the Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    const { container } = render(BatchProgress, {
      props: { done: 1, total: 5, liveMessage: 'Translating 5 paragraphs…', onCancel },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-batch-cancel]');
    expect(btn).toBeTruthy();
    if (btn) await fireEvent.click(btn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps progressbar values and fill width within valid bounds', () => {
    const { container } = render(BatchProgress, {
      props: { done: 9, total: 4, liveMessage: 'Finishing translationâ€¦', onCancel: () => {} },
    });

    const bar = container.querySelector('[data-ega-batch-bar]');
    const fill = container.querySelector<HTMLElement>('[data-ega-batch-bar-fill]');
    expect(bar?.getAttribute('aria-valuemin')).toBe('0');
    expect(bar?.getAttribute('aria-valuemax')).toBe('4');
    expect(bar?.getAttribute('aria-valuenow')).toBe('4');
    expect(fill?.style.width).toBe('100%');
  });
});
