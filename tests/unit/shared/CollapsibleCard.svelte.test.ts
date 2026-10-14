// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import CollapsibleCard from '@/shared/components/CollapsibleCard.svelte';

describe('CollapsibleCard', () => {
  it('renders summary and body; body hidden when closed', () => {
    const { container } = render(CollapsibleCard, {
      props: { open: false, title: 'Anthropic' },
    });
    const details = container.querySelector('details');
    expect(details).toBeInstanceOf(HTMLDetailsElement);
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(container.textContent).toContain('Anthropic');
  });

  it('body visible when open=true', () => {
    const { container } = render(CollapsibleCard, {
      props: { open: true, title: 'OpenAI' },
    });
    const details = container.querySelector('details');
    expect(details).toBeInstanceOf(HTMLDetailsElement);
    expect((details as HTMLDetailsElement).open).toBe(true);
  });

  it('applies data-backend-id attribute for querying', () => {
    const { container } = render(CollapsibleCard, {
      props: { open: false, title: 'x', backendId: 'anthropic' },
    });
    const details = container.querySelector('[data-backend-id="anthropic"]');
    expect(details).toBeTruthy();
  });
});
