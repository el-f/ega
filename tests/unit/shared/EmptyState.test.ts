// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import ScrollText from '@lucide/svelte/icons/scroll-text';
import EmptyState from '@/shared/components/EmptyState.svelte';

describe('EmptyState', () => {
  it('renders the title', () => {
    const { getByText } = render(EmptyState, { props: { title: 'No entries yet' } });
    expect(getByText('No entries yet')).toBeTruthy();
  });

  it('renders the default icon when none is given', () => {
    const { getByText } = render(EmptyState, { props: { title: 'x' } });
    expect(getByText('📭')).toBeTruthy();
  });

  it('renders a custom icon', () => {
    const { getByText } = render(EmptyState, { props: { title: 'x', icon: '🔍' } });
    expect(getByText('🔍')).toBeTruthy();
  });

  it('hides the icon when icon is an empty string', () => {
    const { container } = render(EmptyState, { props: { title: 'x', icon: '' } });
    expect(container.querySelector('.icon')).toBeNull();
  });

  it('renders the description when provided', () => {
    const { getByText } = render(EmptyState, {
      props: { title: 'x', description: 'Do something to populate this.' },
    });
    expect(getByText('Do something to populate this.')).toBeTruthy();
  });

  it('renders a Lucide Component icon when one is passed', () => {
    const { container } = render(EmptyState, {
      props: { title: 'x', icon: ScrollText },
    });
    // Lucide icons render an <svg> element; emoji string fallback would
    // be a plain text node — assert the structural shape.
    expect(container.querySelector('.icon-lucide svg')).not.toBeNull();
  });

  it('stamps the data-ega-empty-state attribute for E2E hooks', () => {
    const { container } = render(EmptyState, { props: { title: 'x' } });
    expect(container.querySelector('[data-ega-empty-state]')).not.toBeNull();
  });
});

describe('EmptyState action', () => {
  it('renders its one action as the shared primary button and calls back on click', async () => {
    const onCta = vi.fn();
    const { getByRole } = render(EmptyState, {
      props: { title: 'No rules yet', ctaLabel: 'Add rule', onCta },
    });
    const btn = getByRole('button', { name: 'Add rule' });
    expect(btn.getAttribute('data-variant')).toBe('primary');
    await fireEvent.click(btn);
    expect(onCta).toHaveBeenCalledTimes(1);
  });
});
