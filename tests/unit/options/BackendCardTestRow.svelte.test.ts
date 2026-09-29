// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import BackendCardTestRow from '@/options/components/backend-card/BackendCardTestRow.svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';
import { asBackendIdUnsafe } from '@/shared/brands';

function baseProps(overrides: Partial<{ testSucceeded: boolean }> = {}) {
  return {
    id: asBackendIdUnsafe('anthropic'),
    settings: structuredClone(DEFAULT_SETTINGS) as Settings,
    beStatus: 'ready' as const,
    testRunning: false,
    testSucceeded: false,
    testResult: null,
    testLatencyMs: null,
    testPrefillMs: null,
    testDecodeMs: null,
    testLatencyLabel: null,
    ollama403: false,
    onTest: vi.fn(),
    ...overrides,
  };
}

describe('BackendCardTestRow — disabled state + reason', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('disables Test and gives a key reason when a key-backed backend has no key', () => {
    // anthropic needs a key; DEFAULT_SETTINGS has none.
    const { getByTestId } = render(BackendCardTestRow, { props: baseProps() });
    const btn = getByTestId('backend-card-test-anthropic') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('title')).toMatch(/Add an API key/i);
    expect(btn.getAttribute('aria-label')).toMatch(/Add an API key/i);
  });

  it('enables Test and clears the reason once the key is present', () => {
    const settings = structuredClone(DEFAULT_SETTINGS) as Settings;
    settings.anthropicApiKey = 'sk-ant-test';
    const { getByTestId } = render(BackendCardTestRow, {
      props: { ...baseProps(), settings },
    });
    const btn = getByTestId('backend-card-test-anthropic') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('title')).toBe('');
    expect(btn.getAttribute('aria-label')).toBeNull();
  });

  it('renders the missing-key reason as visible inline text, not just in the tooltip', () => {
    // anthropic needs a key; DEFAULT_SETTINGS has none.
    const { container } = render(BackendCardTestRow, { props: baseProps() });
    const reason = container.querySelector('.be-disabled-reason');
    expect(reason).not.toBeNull();
    expect(reason?.textContent).toMatch(/Add an API key/i);
  });

  it('hides the inline reason once the key is present', () => {
    const settings = structuredClone(DEFAULT_SETTINGS) as Settings;
    settings.anthropicApiKey = 'sk-ant-test';
    const { container } = render(BackendCardTestRow, {
      props: { ...baseProps(), settings },
    });
    expect(container.querySelector('.be-disabled-reason')).toBeNull();
  });

  it('shows the re-probe reason for an unavailable backend that has its key', () => {
    const settings = structuredClone(DEFAULT_SETTINGS) as Settings;
    settings.anthropicApiKey = 'sk-ant-test';
    const { getByTestId } = render(BackendCardTestRow, {
      props: { ...baseProps(), settings, beStatus: 'unavailable' as const },
    });
    const btn = getByTestId('backend-card-test-anthropic') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('title')).toMatch(/checks again/i);
  });
});

describe('BackendCardTestRow — popTimer lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('cancels in-flight popTimer when component unmounts', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');

    const { rerender, unmount } = render(BackendCardTestRow, { props: baseProps() });

    await rerender({ testSucceeded: true });
    // tick() inside the effect is a microtask — flush it
    await Promise.resolve();

    // popTimer is now scheduled; advance partway (timer fires at 600ms)
    vi.advanceTimersByTime(100);

    unmount();

    expect(clearSpy).toHaveBeenCalled();
  });

  it('arms no timer when unmounted before the tick() continuation runs', async () => {
    const setSpy = vi.spyOn(globalThis, 'setTimeout');
    // Mounting already-succeeded arms the continuation inside the sync mount flush.
    const { unmount } = render(BackendCardTestRow, {
      props: baseProps({ testSucceeded: true }),
    });
    setSpy.mockClear();
    unmount();
    await Promise.resolve();
    await Promise.resolve();

    expect(setSpy).not.toHaveBeenCalled();
  });

  it('does not fire justSucceeded reset after unmount', async () => {
    const { rerender, unmount } = render(BackendCardTestRow, { props: baseProps() });

    await rerender({ testSucceeded: true });
    await Promise.resolve();

    vi.advanceTimersByTime(100);
    unmount();

    // If cleanup didn't cancel, advancing past 600ms would throw (writing to
    // dead $state). With fake timers + cleanup, this should be a no-op.
    expect(() => vi.advanceTimersByTime(700)).not.toThrow();
  });
});
