// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ContextPreview from '@/shared/components/ContextPreview.svelte';

describe('ContextPreview', () => {
  it('renders collapsed by default with the "Show" label', () => {
    const { getByText, container } = render(ContextPreview, {
      props: { context: { pageTitle: 'T', pageUrl: 'https://x' } },
    });
    expect(getByText('Show what was sent')).toBeTruthy();
    expect(container.querySelector('dl')).toBeNull();
    expect(container.querySelector('[data-ega-context-raw-toggle]')).toBeNull();
  });

  it('renders humanized dl/dt/dd by default when context present and open', () => {
    const ctx = { pageTitle: 'Example', beforeText: 'foo\nbar' };
    const { container } = render(ContextPreview, {
      props: { context: ctx, open: true },
    });
    expect(container.querySelector('dl')).not.toBeNull();
    const text = container.textContent;
    expect(text).toContain('Page title');
    expect(text).toContain('Example');
    expect(text).toContain('foo↵bar');
  });

  it('toggles to raw JSON view on button click', async () => {
    const ctx = { pageTitle: 'Example' };
    const { container, getByText } = render(ContextPreview, {
      props: { context: ctx, open: true },
    });
    const btn = getByText(/show raw json/i);
    await fireEvent.click(btn);
    expect(container.querySelector('pre.ega-ctx-raw')).not.toBeNull();
    const pre = container.querySelector('[data-ega-context-json]');
    expect(pre?.textContent).toContain('"pageTitle": "Example"');
    // And offers the way back.
    expect(getByText(/show as list/i)).toBeTruthy();
  });

  it('says no page context was sent when context is null and open', () => {
    const { container, getByText } = render(ContextPreview, {
      props: { context: null, open: true },
    });
    expect(container.textContent).toMatch(/No page context was sent/i);
    // No raw-toggle offered when empty — nothing to toggle.
    expect(container.querySelector('[data-ega-context-raw-toggle]')).toBeNull();
    expect(getByText('Hide what was sent')).toBeTruthy();
  });

  it('says no page context was sent when context is {} and open', () => {
    const { container } = render(ContextPreview, {
      props: { context: {}, open: true },
    });
    expect(container.textContent).toMatch(/No page context was sent/i);
    expect(container.querySelector('dl')).toBeNull();
  });

  it('hides body when closed', () => {
    const ctx = { pageTitle: 'x' };
    const { container } = render(ContextPreview, {
      props: { context: ctx, open: false },
    });
    expect(container.querySelector('dl')).toBeNull();
    expect(container.querySelector('[data-ega-context-json]')).toBeNull();
    expect(container.querySelector('[data-ega-context-empty]')).toBeNull();
  });

  it('respects open=true', () => {
    const { container, getByText } = render(ContextPreview, {
      props: { context: { pageTitle: 'T' }, open: true },
    });
    expect(getByText('Hide what was sent')).toBeTruthy();
    expect(container.querySelector('dl')).not.toBeNull();
  });

  it('marks truncated fields with the visual flag', () => {
    const long = 'a'.repeat(200);
    const { container } = render(ContextPreview, {
      props: { context: { beforeText: long }, open: true },
    });
    const dd = container.querySelector('dd.truncated');
    expect(dd).not.toBeNull();
  });
});
