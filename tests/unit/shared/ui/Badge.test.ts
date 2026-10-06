// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Badge from '@/shared/ui/Badge.svelte';
import Check from '@lucide/svelte/icons/check';
import { textSnippet } from './_helpers';

describe('Badge', () => {
  it('renders children', () => {
    const { getByText } = render(Badge, { props: { children: textSnippet('new') } });
    expect(getByText('new')).toBeTruthy();
  });

  it('applies default variant', () => {
    const { container } = render(Badge, { props: { children: textSnippet('x') } });
    expect(container.querySelector('.variant-default')).not.toBeNull();
  });

  it('applies success variant', () => {
    const { container } = render(Badge, {
      props: { variant: 'success', children: textSnippet('x') },
    });
    expect(container.querySelector('.variant-success')).not.toBeNull();
  });

  it('carries its state in words with an optional icon, never a coloured dot', () => {
    const { container } = render(Badge, {
      props: { icon: Check, children: textSnippet('Verified') },
    });
    expect(container.querySelector('.ega-badge-icon svg')).not.toBeNull();
    expect(container.querySelector('.ega-badge-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent.trim()).toBe('Verified');
  });
});
