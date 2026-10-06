// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import StatusBar from '@/options/components/StatusBar.svelte';

describe('StatusBar', () => {
  it('mounts a stable slot wrapper marked empty when there is nothing to say', () => {
    const { container } = render(StatusBar, { props: { show: false } });
    const slot = container.querySelector('[data-ega-status-bar-slot]');
    expect(slot).not.toBeNull();
    expect(slot?.getAttribute('data-empty')).toBe('true');
    expect(container.querySelector('[data-ega-status-bar]')).toBeNull();
  });

  it('is one line saying no backend can run', () => {
    const { container } = render(StatusBar, { props: { show: true } });
    const bar = container.querySelector('[data-ega-status-bar="needs-key"]');
    expect(bar?.textContent.trim()).toBe('No backend is set up yet, so Ega cannot translate');
    expect(
      container.querySelector('[data-ega-status-bar-slot]')?.getAttribute('data-empty'),
    ).not.toBe('true');
  });

  it('offers "Set up a backend" when the page has somewhere to send you', async () => {
    const onSetUp = vi.fn();
    const { getByRole } = render(StatusBar, { props: { show: true, onSetUp } });
    await fireEvent.click(getByRole('button', { name: 'Set up a backend' }));
    expect(onSetUp).toHaveBeenCalledTimes(1);
  });

  it('has no button without a handler (the Backends tab itself)', () => {
    const { container } = render(StatusBar, { props: { show: true } });
    expect(container.querySelector('[data-ega-status-jump-backends]')).toBeNull();
  });
});
