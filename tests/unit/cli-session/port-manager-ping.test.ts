import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { ping, _resetForTest } from '@/shared/cli-session/port-manager';

type FrameListener = (msg: unknown) => void;
type DisconnectListener = (port: chrome.runtime.Port) => void;

interface StubPort {
  postMessage: Mock;
  disconnect: Mock;
  onMessage: {
    addListener: (f: FrameListener) => void;
    removeListener: (f: FrameListener) => void;
  };
  onDisconnect: {
    addListener: (f: DisconnectListener) => void;
    removeListener: (f: DisconnectListener) => void;
  };
  _emit: (m: unknown) => void;
  _disconnect: () => void;
}

function mockPort(): StubPort {
  const msgs: FrameListener[] = [];
  const dis: DisconnectListener[] = [];
  const port: StubPort = {
    postMessage: vi.fn(),
    disconnect: vi.fn(() => dis.forEach((f) => f(port as unknown as chrome.runtime.Port))),
    onMessage: {
      addListener: (f) => msgs.push(f),
      removeListener: (f) => {
        const i = msgs.indexOf(f);
        if (i >= 0) msgs.splice(i, 1);
      },
    },
    onDisconnect: {
      addListener: (f) => dis.push(f),
      removeListener: (f) => {
        const i = dis.indexOf(f);
        if (i >= 0) dis.splice(i, 1);
      },
    },
    _emit: (m) => msgs.forEach((f) => f(m)),
    _disconnect: () => dis.forEach((f) => f(port as unknown as chrome.runtime.Port)),
  };
  return port;
}

const connectNativeMock = chrome.runtime.connectNative as unknown as Mock;

describe('port-manager ping()', () => {
  beforeEach(() => {
    _resetForTest();
    connectNativeMock.mockReset();
  });

  it('writes a ping frame with a uuid-suffixed id', async () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const p = ping(800);
    // Pull the probe id off the frame so the test can echo it.
    const sent = port.postMessage.mock.calls[0]?.[0] as { v: number; kind: string; id: string };
    expect(sent.v).toBe(1);
    expect(sent.kind).toBe('ping');
    expect(sent.id).toMatch(/^ega-probe-pm-/);
    port._emit({ v: 1, id: sent.id, type: 'done' });
    await expect(p).resolves.toBe(true);
  });

  it('resolves true on the matching done frame', async () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const p = ping(800);
    const sentId = (port.postMessage.mock.calls[0]?.[0] as { id: string }).id;
    port._emit({ v: 1, id: sentId, type: 'done' });
    await expect(p).resolves.toBe(true);
  });

  it('resolves false on a matching error frame', async () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const p = ping(800);
    const sentId = (port.postMessage.mock.calls[0]?.[0] as { id: string }).id;
    port._emit({ v: 1, id: sentId, type: 'error', code: 'UNSUPPORTED' });
    await expect(p).resolves.toBe(false);
  });

  it('resolves false on timeout when no terminal frame arrives', async () => {
    vi.useFakeTimers();
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const p = ping(100);
    vi.advanceTimersByTime(150);
    await expect(p).resolves.toBe(false);
    vi.useRealTimers();
  });

  it('resolves false on port disconnect mid-flight', async () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const p = ping(800);
    port._disconnect();
    await expect(p).resolves.toBe(false);
  });

  it('ignores frames addressed to a different id', async () => {
    vi.useFakeTimers();
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const p = ping(200);
    port._emit({ v: 1, id: 'ega-probe-pm-other-call', type: 'done' });
    vi.advanceTimersByTime(300);
    await expect(p).resolves.toBe(false);
    vi.useRealTimers();
  });

  it('two consecutive pings reuse the same port (one connectNative call)', async () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const p1 = ping(800);
    const id1 = (port.postMessage.mock.calls[0]?.[0] as { id: string }).id;
    port._emit({ v: 1, id: id1, type: 'done' });
    await expect(p1).resolves.toBe(true);

    const p2 = ping(800);
    const id2 = (port.postMessage.mock.calls[1]?.[0] as { id: string }).id;
    expect(id2).not.toBe(id1);
    port._emit({ v: 1, id: id2, type: 'done' });
    await expect(p2).resolves.toBe(true);

    expect(connectNativeMock).toHaveBeenCalledTimes(1);
  });
});
