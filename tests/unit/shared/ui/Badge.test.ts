// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Badge from '@/shared/ui/Badge.svelte';
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

  it('renders dot variant', () => {
    const { container } = render(Badge, {
      props: { dot: true, children: textSnippet('x') },
    });
    expect(container.querySelector('.ega-badge-dot')).not.toBeNull();
  });
});
