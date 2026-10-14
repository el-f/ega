import { describe, it, expect, vi, afterEach } from 'vitest';
import { listNativeModels, probeNativeCli } from '@/options/nativeHostOnce';

// A port whose host answers `delayMs` after the request, the way a cold host boot does.
function slowHostPort(delayMs: number, reply: (id: string) => unknown[]) {
  let onMessage: ((m: unknown) => void) | undefined;
  return {
    postMessage: vi.fn((m: unknown) => {
      const id = (m as { id: string }).id;
      setTimeout(() => {
        for (const frame of reply(id)) onMessage?.(frame);
      }, delayMs);
    }),
    disconnect: vi.fn(),
    onMessage: {
      addListener: (fn: (m: unknown) => void) => {
        onMessage = fn;
      },
    },
    onDisconnect: { addListener: () => {} },
  };
}

function stubHost(delayMs: number, reply: (id: string) => unknown[]): void {
  vi.stubGlobal('chrome', {
    ...globalThis.chrome,
    runtime: {
      ...globalThis.chrome.runtime,
      connectNative: vi.fn(() => slowHostPort(delayMs, reply) as unknown as chrome.runtime.Port),
    },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('one-shot host requests wait out a cold host boot', () => {
  it('listNativeModels gets the menu from a host that took 2 s to start', async () => {
    vi.useFakeTimers();
    stubHost(2_000, (id) => [
      { v: 1, id, type: 'models', models: ['opus', 'sonnet'] },
      { v: 1, id, type: 'done' },
    ]);
    const list = listNativeModels('claude', 800);
    await vi.advanceTimersByTimeAsync(2_100);
    await expect(list).resolves.toEqual(['opus', 'sonnet']);
  });

  it('probeNativeCli gets the PATH answer from a host that took 2 s to start', async () => {
    vi.useFakeTimers();
    stubHost(2_000, (id) => [
      {
        v: 1,
        id,
        type: 'cli-presence',
        cli: { claude: 'C:/bin/claude.exe', codex: null },
      },
      { v: 1, id, type: 'cli-login', loggedIn: { claude: false, codex: null, junk: 'yes' } },
      { v: 1, id, type: 'done' },
    ]);
    const presence = probeNativeCli(800);
    await vi.advanceTimersByTimeAsync(2_100);
    await expect(presence).resolves.toEqual({
      cli: { claude: 'C:/bin/claude.exe', codex: null },
      loggedIn: { claude: false, codex: null },
    });
  });

  it('probeNativeCli keeps the PATH answer when the login checks outlast the budget', async () => {
    vi.useFakeTimers();
    stubHost(2_000, (id) => [
      { v: 1, id, type: 'cli-presence', cli: { claude: null, codex: 'C:/bin/codex.cmd' } },
    ]);
    const presence = probeNativeCli(800);
    await vi.advanceTimersByTimeAsync(5_100);
    await expect(presence).resolves.toEqual({
      cli: { claude: null, codex: 'C:/bin/codex.cmd' },
      loggedIn: {},
    });
  });
});
