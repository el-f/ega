// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import Toast from '@/content/components/Toast.svelte';

describe('Toast component', () => {
  it('renders the message text', () => {
    const { container, getByText } = render(Toast, {
      props: { message: 'Nothing to translate here.' },
    });
    expect(getByText('Nothing to translate here.')).toBeTruthy();
    const el = container.querySelector('.ega-toast');
    expect(el).toBeTruthy();
  });

  it('carries role=status + aria-live=polite for accessibility', () => {
    const { container } = render(Toast, { props: { message: 'hi' } });
    const el = container.querySelector('.ega-toast');
    expect(el?.getAttribute('role')).toBe('status');
    expect(el?.getAttribute('aria-live')).toBe('polite');
  });

  it('renders no action button when the caller gives none', () => {
    const { container } = render(Toast, { props: { message: 'hi' } });
    expect(container.querySelector('[data-ega-toast-action]')).toBeNull();
  });

  it('runs the action on click', () => {
    const onaction = vi.fn();
    const { container } = render(Toast, {
      props: { message: 'Ega was updated', actionLabel: 'Reload page', onaction },
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-ega-toast-action]');
    expect(btn?.textContent).toBe('Reload page');
    btn?.click();
    expect(onaction).toHaveBeenCalledTimes(1);
  });
});
