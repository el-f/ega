// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Badge from '@/shared/ui/Badge.svelte';
import { readFileSync } from 'node:fs';
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

  it('carries its state in words, never a coloured dot', () => {
    const { container } = render(Badge, { props: { children: textSnippet('Verified') } });
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent.trim()).toBe('Verified');
  });

  // The status pill draws its own icon at PILL_ICON; a second icon path here would be a second size to keep in step.
  it('has no icon prop of its own', () => {
    expect(readFileSync('src/shared/ui/Badge.svelte', 'utf8')).not.toMatch(
      /\bicon\??:|ega-badge-icon/,
    );
  });
});
