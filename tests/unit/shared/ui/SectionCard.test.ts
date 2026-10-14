// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import SectionCard from '@/shared/ui/SectionCard.svelte';
import { textSnippet } from './_helpers';

describe('SectionCard', () => {
  it('renders title', () => {
    const { getByText } = render(SectionCard, {
      props: { title: 'Display', children: textSnippet('body') },
    });
    expect(getByText('Display')).toBeTruthy();
  });

  it('renders description when given', () => {
    const { getByText } = render(SectionCard, {
      props: {
        title: 'Display',
        description: 'How Ega looks and moves.',
        children: textSnippet('body'),
      },
    });
    expect(getByText('How Ega looks and moves.')).toBeTruthy();
  });

  it('omits description element when not given', () => {
    const { container } = render(SectionCard, {
      props: { title: 'Display', children: textSnippet('body') },
    });
    expect(container.querySelector('.ega-section-card-desc')).toBeNull();
  });

  it('renders footer snippet when given', () => {
    const { getByText } = render(SectionCard, {
      props: {
        title: 'Display',
        children: textSnippet('body'),
        footer: textSnippet('Save'),
      },
    });
    expect(getByText('Save')).toBeTruthy();
  });

  it('renders body children', () => {
    const { getByText } = render(SectionCard, {
      props: { title: 'x', children: textSnippet('body content') },
    });
    expect(getByText('body content')).toBeTruthy();
  });

  it('renders title as an h2 with a stable id for aria-labelledby', () => {
    const { container } = render(SectionCard, {
      props: { title: 'Display', children: textSnippet('x') },
    });
    const h2 = container.querySelector('h2');
    expect(h2).not.toBeNull();
    expect(h2?.id).toBeTruthy();
    const section = container.querySelector('section');
    expect(section?.getAttribute('aria-labelledby')).toBe(h2?.id);
  });
});
