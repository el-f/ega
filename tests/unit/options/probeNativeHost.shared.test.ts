// Every probe spawns a host process; callers inside one short window share one.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { probeNativeHost, _resetProbeNativeHostForTest } from '@/options/probeNativeHost';
import { EXPECTED_HOST_VERSION } from '@/options/nativeHostInstall';

function mockPort() {
  const messageListeners: Array<(m: unknown) => void> = [];
  let postedId: string | undefined;
  return {
    postMessage: vi.fn((m: unknown) => {
      postedId = (m as { id?: string }).id;
    }),
    disconnect: vi.fn(),
    onMessage: { addListener: (f: (m: unknown) => void) => messageListeners.push(f) },
    onDisconnect: { addListener: () => {} },
    answer: () =>
      messageListeners.forEach((f) =>
        f({ v: 1, id: postedId, type: 'done', hostVersion: EXPECTED_HOST_VERSION }),
      ),
    answerTo: (id: string | undefined) =>
      messageListeners.forEach((f) =>
        f({ v: 1, id, type: 'done', hostVersion: EXPECTED_HOST_VERSION }),
      ),
  };
}

const connectNative = chrome.runtime.connectNative as unknown as Mock;

beforeEach(() => {
  _resetProbeNativeHostForTest();
  connectNative.mockReset();
  delete (chrome.runtime as { lastError?: chrome.runtime.LastError }).lastError;
});

describe('probeNativeHost sharing', () => {
  it('two callers in flight open one port and get the same answer', async () => {
    const port = mockPort();
    connectNative.mockReturnValue(port);
    const a = probeNativeHost(50);
    const b = probeNativeHost(50);
    await Promise.resolve();
    port.answer();
    const [ra, rb] = await Promise.all([a, b]);
    expect(connectNative).toHaveBeenCalledTimes(1);
    expect(ra.status).toBe('installed');
    expect(rb).toEqual(ra);
  });

  it('a call right after a settled probe reuses its result', async () => {
    const port = mockPort();
    connectNative.mockReturnValue(port);
    const first = probeNativeHost(50);
    await Promise.resolve();
    port.answer();
    await first;
    const again = await probeNativeHost(50);
    expect(again.status).toBe('installed');
    expect(connectNative).toHaveBeenCalledTimes(1);
  });

  describe('on a host that answers after one second', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      connectNative.mockImplementation(() => {
        const port = mockPort();
        port.postMessage.mockImplementation((m: unknown) => {
          setTimeout(() => port.answerTo((m as { id?: string }).id), 1_000);
        });
        return port;
      });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('a Recheck with a longer timeout does not take the in-flight short probe', async () => {
      const a = probeNativeHost();
      const b = probeNativeHost(3_000, { fresh: true });
      await vi.advanceTimersByTimeAsync(1_000);
      expect((await a).status).toBe('not_installed');
      expect((await b).status).toBe('installed');
    });

    it('a longer timeout does not share an in-flight shorter probe', async () => {
      const a = probeNativeHost(800);
      const b = probeNativeHost(3_000);
      await vi.advanceTimersByTimeAsync(1_000);
      expect((await a).status).toBe('not_installed');
      expect((await b).status).toBe('installed');
    });

    it('a longer timeout does not reuse a recent shorter result', async () => {
      const a = probeNativeHost(800);
      await vi.advanceTimersByTimeAsync(800);
      expect((await a).status).toBe('not_installed');
      const b = probeNativeHost(3_000);
      await vi.advanceTimersByTimeAsync(1_000);
      expect((await b).status).toBe('installed');
    });

    it('a shorter timeout shares an in-flight longer probe', async () => {
      const a = probeNativeHost(3_000);
      const b = probeNativeHost(800);
      await vi.advanceTimersByTimeAsync(1_000);
      expect((await b).status).toBe('installed');
      expect((await a).status).toBe('installed');
      expect(connectNative).toHaveBeenCalledTimes(1);
    });
  });

  it('a call after the window opens a new port', async () => {
    vi.useFakeTimers();
    try {
      const port = mockPort();
      connectNative.mockReturnValue(port);
      const first = probeNativeHost(50);
      await Promise.resolve();
      port.answer();
      await first;
      vi.advanceTimersByTime(3_500);
      const second = probeNativeHost(50);
      await Promise.resolve();
      port.answer();
      await second;
      expect(connectNative).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
