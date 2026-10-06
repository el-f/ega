// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { render } from '@testing-library/svelte';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { Settings } from '@/shared/types';

const probeNativeHost = vi.fn();
vi.mock('@/options/probeNativeHost', () => ({ probeNativeHost }));

const { default: NativeBackendCard } =
  await import('@/options/components/NativeBackendCard.svelte');

// Each poll wakes the MV3 service worker, so a background tab must not keep asking.

function baseProps() {
  return {
    settings: structuredClone(DEFAULT_SETTINGS) as Settings,
    disabled: false,
    onPatch: vi.fn(),
    onPatchModel: vi.fn(),
  };
}

function portPolls(): number {
  const send = chrome.runtime.sendMessage as unknown as Mock;
  return send.mock.calls.filter(
    (c) => (c[0] as { kind?: string } | undefined)?.kind === 'native:get-port-status',
  ).length;
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('NativeBackendCard — the port-status poll follows the tab', () => {
  beforeEach(() => {
    probeNativeHost.mockReset();
    probeNativeHost.mockResolvedValue({ status: 'installed', installedVersion: 99 });
    (chrome.runtime.sendMessage as unknown as Mock).mockReset();
    (chrome.runtime.sendMessage as unknown as Mock).mockResolvedValue({
      ok: true,
      status: 'warm',
    });
    vi.useFakeTimers();
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('polls well under once a second while the tab is visible', async () => {
    render(NativeBackendCard, baseProps());
    await vi.advanceTimersByTimeAsync(0);
    const start = portPolls();
    expect(start).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(portPolls() - start).toBeLessThanOrEqual(10);
  });

  it('stops asking once the tab is hidden', async () => {
    render(NativeBackendCard, baseProps());
    await vi.advanceTimersByTimeAsync(10_000);

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(0);
    const parked = portPolls();

    await vi.advanceTimersByTimeAsync(120_000);
    expect(portPolls()).toBe(parked);
  });

  it('asks again as soon as the tab comes back', async () => {
    render(NativeBackendCard, baseProps());
    await vi.advanceTimersByTimeAsync(10_000);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(60_000);
    const parked = portPolls();

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(portPolls()).toBe(parked + 1);
  });
});
