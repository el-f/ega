// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';

const probeNativeHost = vi.fn();
vi.mock('@/options/probeNativeHost', () => ({ probeNativeHost }));

const { default: Options } = await import('@/options/Options.svelte');

// Every probe opens a native-messaging port, which spawns the host process.

function seed(): void {
  chromeMock.storage.local._raw.set('ega.settings', parseSettings({ onboardingDismissed: true }));
}

/** Two passes: the probe resolves on one, the next delay is armed on the other. */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('Options — the native-host probe backs off and stops', () => {
  beforeEach(() => {
    resetChromeMock();
    probeNativeHost.mockReset();
    probeNativeHost.mockResolvedValue({ status: 'not_installed' });
    vi.useFakeTimers();
    seed();
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('waits longer after each miss instead of every 5 seconds forever', async () => {
    render(Options);
    await flush();
    expect(probeNativeHost).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(probeNativeHost).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(probeNativeHost).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(probeNativeHost).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(probeNativeHost).toHaveBeenCalledTimes(4);
  });

  it('gives up after a handful of misses', async () => {
    render(Options);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    const settled = probeNativeHost.mock.calls.length;
    expect(settled).toBeLessThan(10);

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(probeNativeHost).toHaveBeenCalledTimes(settled);
  });

  it('probes once more when the user comes back to the tab', async () => {
    render(Options);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    const settled = probeNativeHost.mock.calls.length;

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(probeNativeHost).toHaveBeenCalledTimes(settled + 1);
  });

  it('probes with the local-backend check timeout the user set', async () => {
    chromeMock.storage.local._raw.set(
      'ega.settings',
      parseSettings({ onboardingDismissed: true, localBackendTimeoutMs: 3_000 }),
    );
    render(Options);
    await flush();
    expect(probeNativeHost).toHaveBeenCalledTimes(1);
    expect(probeNativeHost.mock.calls[0]?.[0]).toBe(3_000);
  });

  it('a settings save does not restart the poll', async () => {
    render(Options);
    await flush();
    expect(probeNativeHost).toHaveBeenCalledTimes(1);

    const cur = chromeMock.storage.local._raw.get('ega.settings') as Record<string, unknown>;
    await chrome.storage.local.set({ 'ega.settings': { ...cur, theme: 'dark' } });
    await flush();
    expect(probeNativeHost).toHaveBeenCalledTimes(1);
  });

  it('stops for good once the host answers', async () => {
    probeNativeHost.mockResolvedValue({ status: 'installed', installedVersion: 99 });
    render(Options);
    await vi.advanceTimersByTimeAsync(0);
    expect(probeNativeHost).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(probeNativeHost).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(probeNativeHost).toHaveBeenCalledTimes(1);
  });
});
