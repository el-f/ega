// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import StatusBar from '@/options/components/StatusBar.svelte';

describe('StatusBar', () => {
  it('mounts a stable slot wrapper marked empty when kind is null', () => {
    const { container } = render(StatusBar, { props: { kind: null } });
    const slot = container.querySelector('[data-ega-status-bar-slot]');
    expect(slot).not.toBeNull();
    expect(slot?.getAttribute('data-empty')).toBe('true');
    expect(container.querySelector('[data-ega-status-bar]')).toBeNull();
  });

  it('surfaces the needs-key bar when kind=needs-key', () => {
    const { container } = render(StatusBar, { props: { kind: 'needs-key' } });
    const bar = container.querySelector('[data-ega-status-bar="needs-key"]');
    expect(bar).not.toBeNull();
    expect(bar?.textContent).toMatch(/No backend configured/);
    // Stable wrapper marks itself non-empty when content mounts.
    expect(
      container.querySelector('[data-ega-status-bar-slot]')?.getAttribute('data-empty'),
    ).not.toBe('true');
  });

  it('needs-key bar copy names all three setup paths (key, Ollama, native)', () => {
    const { container } = render(StatusBar, { props: { kind: 'needs-key' } });
    const text = container.querySelector('[data-ega-status-bar="needs-key"]')?.textContent ?? '';
    expect(text).toMatch(/API key/i);
    expect(text).toMatch(/Ollama/i);
    expect(text).toMatch(/native/i);
  });

  it('needs-key bar copy drops the "below" direction-of-reference word', () => {
    const { container } = render(StatusBar, { props: { kind: 'needs-key' } });
    const bar = container.querySelector('[data-ega-status-bar="needs-key"]');
    expect(bar?.textContent ?? '').not.toMatch(/below/i);
  });

  it('renders Go-to-Backends CTA when onJumpToBackends wired + fires the handler', async () => {
    const onJumpToBackends = vi.fn();
    const { container } = render(StatusBar, {
      props: { kind: 'needs-key', onJumpToBackends },
    });
    const cta = container.querySelector(
      '[data-ega-status-jump-backends]',
    ) as HTMLButtonElement | null;
    expect(cta).not.toBeNull();
    expect(cta?.textContent).toMatch(/Backends/);
    await fireEvent.click(cta as HTMLButtonElement);
    expect(onJumpToBackends).toHaveBeenCalledTimes(1);
  });

  it('omits the Go-to-Backends CTA when handler is missing', () => {
    const { container } = render(StatusBar, { props: { kind: 'needs-key' } });
    expect(container.querySelector('[data-ega-status-jump-backends]')).toBeNull();
  });

  it('surfaces the onboarding banner when kind=onboarding and handlers wired', () => {
    const { container } = render(StatusBar, {
      props: {
        kind: 'onboarding',
        onChooseGemini: vi.fn(),
        onDismissOnboarding: vi.fn(),
      },
    });
    const bar = container.querySelector('[data-ega-status-bar="onboarding"]');
    expect(bar).not.toBeNull();
  });

  it('hides the onboarding banner if handlers are missing (defensive)', () => {
    const { container } = render(StatusBar, { props: { kind: 'onboarding' } });
    // Stable slot wrapper still mounts but reports empty.
    expect(container.querySelector('[data-ega-status-bar-slot]')?.getAttribute('data-empty')).toBe(
      'true',
    );
    expect(container.querySelector('[data-ega-status-bar]')).toBeNull();
  });
});
