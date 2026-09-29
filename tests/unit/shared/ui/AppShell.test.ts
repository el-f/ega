// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import AppShell from '@/shared/ui/AppShell.svelte';
import { textSnippet } from './_helpers';

describe('AppShell', () => {
  it('renders body children', () => {
    const { getByText } = render(AppShell, { props: { children: textSnippet('body content') } });
    expect(getByText('body content')).toBeTruthy();
  });

  it('renders header snippet when given', () => {
    const { getByText } = render(AppShell, {
      props: {
        header: textSnippet('head row'),
        children: textSnippet('body'),
      },
    });
    expect(getByText('head row')).toBeTruthy();
    expect(getByText('body')).toBeTruthy();
  });

  it('renders footer snippet when given', () => {
    const { getByText } = render(AppShell, {
      props: {
        children: textSnippet('body'),
        footer: textSnippet('foot row'),
      },
    });
    expect(getByText('foot row')).toBeTruthy();
  });

  it('omits header wrapper when header prop absent', () => {
    const { container } = render(AppShell, { props: { children: textSnippet('body') } });
    expect(container.querySelector('.ega-app-shell-header')).toBeNull();
  });

  it('omits footer wrapper when footer prop absent', () => {
    const { container } = render(AppShell, { props: { children: textSnippet('body') } });
    expect(container.querySelector('.ega-app-shell-footer')).toBeNull();
  });

  it('stamps data-ega-app-shell marker on the root', () => {
    const { container } = render(AppShell, { props: { children: textSnippet('x') } });
    expect(container.querySelector('[data-ega-app-shell]')).not.toBeNull();
  });
});
