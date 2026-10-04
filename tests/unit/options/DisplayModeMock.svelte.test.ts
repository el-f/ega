// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import DisplayModeMock from '@/options/components/DisplayModeMock.svelte';

// The mock separates words with &nbsp;; normalize to a plain space before asserting.
function normalizeSpaces(text: string | null): string {
  return (text ?? '').replace(/\xa0/g, ' ');
}

describe('DisplayModeMock', () => {
  it('renders the tooltip mock sentence with normal word gaps', () => {
    const { container } = render(DisplayModeMock, { props: { variant: 'tooltip', active: false } });
    const page = container.querySelector('.mock-page');
    if (!page) throw new Error('.mock-page not found');
    // Highlight spans must not swallow the space at their edges.
    expect(normalizeSpaces(page.textContent)).toContain('ipsum dolor sit amet');
  });

  it('renders the inline mock sentence with normal word gaps', () => {
    const { container } = render(DisplayModeMock, { props: { variant: 'inline', active: false } });
    const page = container.querySelector('.mock-page');
    if (!page) throw new Error('.mock-page not found');
    expect(normalizeSpaces(page.textContent)).toContain('ipsum translated text amet');
  });

  it('applies the accent border via .active when active', () => {
    const { container } = render(DisplayModeMock, { props: { variant: 'tooltip', active: true } });
    expect(container.querySelector('.mock.active')).not.toBeNull();
  });
});
