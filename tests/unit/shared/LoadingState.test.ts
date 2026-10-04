// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LoadingState from '@/shared/components/LoadingState.svelte';

describe('LoadingState', () => {
  it('renders three shimmer rows by default', () => {
    const { container } = render(LoadingState, { props: {} });
    const rows = container.querySelectorAll('.shimmer-row');
    expect(rows.length).toBe(3);
  });

  it('renders N shimmer rows', () => {
    const { container } = render(LoadingState, { props: { rows: 5 } });
    expect(container.querySelectorAll('.shimmer-row').length).toBe(5);
  });

  it('clamps a 0 request to at least one row', () => {
    const { container } = render(LoadingState, { props: { rows: 0 } });
    expect(container.querySelectorAll('.shimmer-row').length).toBe(1);
  });

  it('uses the provided aria-label', () => {
    const { container } = render(LoadingState, {
      props: { label: 'Loading widgets…' },
    });
    const host = container.querySelector('[data-ega-loading-state]');
    expect(host?.getAttribute('aria-label')).toBe('Loading widgets…');
    expect(host?.getAttribute('role')).toBe('status');
    expect(host?.getAttribute('aria-live')).toBe('polite');
  });
});
