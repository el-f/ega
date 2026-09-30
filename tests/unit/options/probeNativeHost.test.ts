import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { probeNativeHost, _resetProbeNativeHostForTest } from '@/options/probeNativeHost';
import { EXPECTED_HOST_VERSION } from '@/options/nativeHostInstall';
import { NATIVE_COLD_BOOT_TIMEOUT_MS } from '@/shared/constants';

type PortStub = {
  postMessage: Mock;
  disconnect: Mock;
  onMessage: { addListener: (f: (m: unknown) => void) => void };
  onDisconnect: { addListener: (f: () => void) => void };
  _emit: (m: unknown) => void;
  _disconnect: () => void;
};

function mockPort(): PortStub {
  const messageListeners: Array<(m: unknown) => void> = [];
  const disconnectListeners: Array<() => void> = [];
  return {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: (f) => messageListeners.push(f) },
    onDisconnect: { addListener: (f) => disconnectListeners.push(f) },
    _emit: (m) => messageListeners.forEach((f) => f(m)),
    _disconnect: () => disconnectListeners.forEach((f) => f()),
  };
}

describe('probeNativeHost', () => {
  beforeEach(() => {
    _resetProbeNativeHostForTest();
    delete (chrome.runtime as { lastError?: chrome.runtime.LastError }).lastError;
  });

  // Bumped with HOST_VERSION in native-host/ega-host.mjs; a 0 here means the extraction regex broke.
  it('reads the bundled host version', () => {
    expect(EXPECTED_HOST_VERSION).toBe(3);
  });

  it('returns installed + version when host matches EXPECTED_HOST_VERSION', async () => {
    const port = mockPort();
    let postedId: string | undefined;
    port.postMessage = vi.fn((m: unknown) => {
      const f = m as { id?: string };
      postedId = f.id;
    });
    (chrome.runtime.connectNative as unknown as Mock).mockReturnValueOnce(port);
    const p = probeNativeHost(50);
    await Promise.resolve();
    port._emit({ v: 1, id: postedId, type: 'done', hostVersion: EXPECTED_HOST_VERSION });
    const r = await p;
    expect(r.status).toBe('installed');
    expect(r.installedVersion).toBe(EXPECTED_HOST_VERSION);
  });

  it('flags outdated when host version is below EXPECTED_HOST_VERSION', async () => {
    const port = mockPort();
    let postedId: string | undefined;
    port.postMessage = vi.fn((m: unknown) => {
      const f = m as { id?: string };
      postedId = f.id;
    });
    (chrome.runtime.connectNative as unknown as Mock).mockReturnValueOnce(port);
    const p = probeNativeHost(50);
    await Promise.resolve();
    port._emit({ v: 1, id: postedId, type: 'done', hostVersion: 0 });
    const r = await p;
    expect(r.status).toBe('outdated');
    expect(r.installedVersion).toBe(0);
  });

  it('flags outdated when host omits hostVersion (predates version reporting)', async () => {
    const port = mockPort();
    let postedId: string | undefined;
    port.postMessage = vi.fn((m: unknown) => {
      const f = m as { id?: string };
      postedId = f.id;
    });
    (chrome.runtime.connectNative as unknown as Mock).mockReturnValueOnce(port);
    const p = probeNativeHost(50);
    await Promise.resolve();
    port._emit({ v: 1, id: postedId, type: 'done' });
    const r = await p;
    expect(r.status).toBe('outdated');
    expect(r.installedVersion).toBeUndefined();
  });

  it('surfaces chrome.runtime.lastError.message when host disconnects without replying', async () => {
    const port = mockPort();
    (chrome.runtime.connectNative as unknown as Mock).mockReturnValueOnce(port);
    const p = probeNativeHost(50);
    await Promise.resolve();
    // Chrome sets lastError before it fires onDisconnect.
    Object.defineProperty(chrome.runtime, 'lastError', {
      value: { message: 'Specified native messaging host not found.' },
      configurable: true,
      writable: true,
    });
    port._disconnect();
    const r = await p;
    expect(r.status).toBe('not_installed');
    expect(r.errorMessage).toBe('Specified native messaging host not found.');
  });

  it('surfaces forbidden-origin error verbatim (allowed_origins mismatch)', async () => {
    const port = mockPort();
    (chrome.runtime.connectNative as unknown as Mock).mockReturnValueOnce(port);
    const p = probeNativeHost(50);
    await Promise.resolve();
    Object.defineProperty(chrome.runtime, 'lastError', {
      value: { message: 'Access to the specified native messaging host is forbidden.' },
      configurable: true,
      writable: true,
    });
    port._disconnect();
    const r = await p;
    expect(r.status).toBe('not_installed');
    expect(r.errorMessage).toMatch(/forbidden/i);
  });

  it('disconnects with no lastError set → not_installed with no errorMessage', async () => {
    const port = mockPort();
    (chrome.runtime.connectNative as unknown as Mock).mockReturnValueOnce(port);
    const p = probeNativeHost(50);
    await Promise.resolve();
    port._disconnect();
    const r = await p;
    expect(r.status).toBe('not_installed');
    expect(r.errorMessage).toBeUndefined();
  });

  it('timeout case yields not_installed without errorMessage', async () => {
    vi.useFakeTimers();
    const port = mockPort();
    (chrome.runtime.connectNative as unknown as Mock).mockReturnValueOnce(port);
    const p = probeNativeHost(50);
    vi.advanceTimersByTime(NATIVE_COLD_BOOT_TIMEOUT_MS + 10);
    const r = await p;
    expect(r.status).toBe('not_installed');
    expect(r.errorMessage).toBeUndefined();
    vi.useRealTimers();
  });

  it('a host that boots slower than the configured timeout still reads installed', async () => {
    vi.useFakeTimers();
    const port = mockPort();
    let postedId: string | undefined;
    port.postMessage = vi.fn((m: unknown) => {
      postedId = (m as { id?: string }).id;
    });
    (chrome.runtime.connectNative as unknown as Mock).mockReturnValueOnce(port);
    const p = probeNativeHost(800);
    vi.advanceTimersByTime(2_000);
    port._emit({ v: 1, id: postedId, type: 'done', hostVersion: EXPECTED_HOST_VERSION });
    const r = await p;
    expect(r.status).toBe('installed');
    vi.useRealTimers();
  });

  it('ignores frames whose id does not match the minted probeId', async () => {
    vi.useFakeTimers();
    const port = mockPort();
    let postedId: string | undefined;
    port.postMessage = vi.fn((m: unknown) => {
      const f = m as { id?: string };
      postedId = f.id;
    });
    (chrome.runtime.connectNative as unknown as Mock).mockReturnValueOnce(port);
    const p = probeNativeHost(50);
    await Promise.resolve();
    port._emit({ v: 1, id: 'stale-id', type: 'done', hostVersion: 99 });
    vi.advanceTimersByTime(NATIVE_COLD_BOOT_TIMEOUT_MS + 10);
    const r = await p;
    expect(r.status).toBe('not_installed');
    expect(r.installedVersion).toBeUndefined();
    expect(postedId).toBeDefined();
    expect(postedId).not.toBe('stale-id');
    vi.useRealTimers();
  });

  it('settles on a frame matching the minted probeId', async () => {
    const port = mockPort();
    let postedId: string | undefined;
    port.postMessage = vi.fn((m: unknown) => {
      const f = m as { id?: string };
      postedId = f.id;
    });
    (chrome.runtime.connectNative as unknown as Mock).mockReturnValueOnce(port);
    const p = probeNativeHost(50);
    await Promise.resolve();
    expect(postedId).toBeDefined();
    port._emit({ v: 1, id: postedId, type: 'done', hostVersion: EXPECTED_HOST_VERSION });
    const r = await p;
    expect(r.status).toBe('installed');
    expect(r.installedVersion).toBe(EXPECTED_HOST_VERSION);
  });
});
