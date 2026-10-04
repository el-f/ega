import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import {
  send,
  cancel,
  getStatus,
  warm,
  resetPortManagerForTest,
} from '@/shared/cli-session/port-manager';

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

describe('port-manager', () => {
  beforeEach(() => {
    resetPortManagerForTest();
  });

  it('initial status is cold', () => {
    expect(getStatus()).toBe('cold');
  });

  it('first send flips status to connecting (warm requires a session-spawned frame)', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    send({ v: 1, kind: 'ping' }, () => {});
    expect(getStatus()).toBe('connecting');
  });

  it('status flips to warm only after a session-spawned frame lands', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    send({ v: 1, kind: 'ping' }, () => {});
    port._emit({ v: 1, id: 'p1', type: 'done' });
    expect(getStatus()).toBe('connecting');
    port._emit({ v: 1, kind: 'session', provider: 'claude', state: 'spawned' });
    expect(getStatus()).toBe('warm');
  });

  it('session-reaped frame drops status back to connecting (port stays alive)', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    send({ v: 1, kind: 'ping' }, () => {});
    port._emit({ v: 1, kind: 'session', provider: 'claude', state: 'spawned' });
    expect(getStatus()).toBe('warm');
    port._emit({ v: 1, kind: 'session', provider: 'claude', state: 'reaped' });
    expect(getStatus()).toBe('connecting');
  });

  it('any-provider-warm rule: status stays warm while one CLI is alive', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    send({ v: 1, kind: 'ping' }, () => {});
    port._emit({ v: 1, kind: 'session', provider: 'claude', state: 'spawned' });
    port._emit({ v: 1, kind: 'session', provider: 'codex', state: 'spawned' });
    expect(getStatus()).toBe('warm');
    port._emit({ v: 1, kind: 'session', provider: 'claude', state: 'reaped' });
    expect(getStatus()).toBe('warm');
    port._emit({ v: 1, kind: 'session', provider: 'codex', state: 'reaped' });
    expect(getStatus()).toBe('connecting');
  });

  it('two sequential sends reuse a single connectNative call', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    send({ v: 1, kind: 'ping', id: 'a' }, () => {});
    send({ v: 1, kind: 'ping', id: 'b' }, () => {});
    expect(connectNativeMock).toHaveBeenCalledTimes(1);
  });

  it('postMessage receives the frame verbatim', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const frame = { v: 1, kind: 'translate', id: 'x', text: 'hi' };
    send(frame, () => {});
    expect(port.postMessage).toHaveBeenCalledWith(frame);
  });

  it('registered handler fires on incoming frame', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const seen: unknown[] = [];
    send({ v: 1, kind: 'ping' }, (m) => seen.push(m));
    port._emit({ v: 1, kind: 'pong' });
    expect(seen).toEqual([{ v: 1, kind: 'pong' }]);
  });

  it('unsubscribe returned by send detaches the handler', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const seen: unknown[] = [];
    const off = send({ v: 1, kind: 'ping' }, (m) => seen.push(m));
    off();
    port._emit({ v: 1, kind: 'pong' });
    expect(seen).toEqual([]);
  });

  it('disconnect after a warmed port (received frame) flips status and the next send spawns a fresh port', () => {
    const portA = mockPort();
    const portB = mockPort();
    connectNativeMock.mockReturnValueOnce(portA).mockReturnValueOnce(portB);
    send({ v: 1, kind: 'ping', id: 'a' }, () => {});
    // Warm: a frame from the host clears the backoff counter so a later
    // disconnect doesn't trigger backoff.
    portA._emit({ v: 1, id: 'a', type: 'done' });
    portA._disconnect();
    expect(getStatus()).toBe('disconnected');
    send({ v: 1, kind: 'ping', id: 'b' }, () => {});
    expect(connectNativeMock).toHaveBeenCalledTimes(2);
    // Fresh port has no CLI session yet; status stays connecting until a
    // session-spawned frame lands.
    expect(getStatus()).toBe('connecting');
    portB._emit({ v: 1, kind: 'session', provider: 'claude', state: 'spawned' });
    expect(getStatus()).toBe('warm');
  });

  it('a send inside the backoff window fails fast via onPortDisconnect instead of dropping silently', async () => {
    const portA = mockPort();
    connectNativeMock.mockReturnValueOnce(portA);
    send({ v: 1, kind: 'ping', id: 'a' }, () => {});
    // Cold-fail: host disconnects before any frame lands, opening the backoff window.
    portA._disconnect();
    const reasons: Array<string | undefined> = [];
    const off = send(
      { v: 1, kind: 'translate', id: 'dropped' },
      () => {},
      (reason) => reasons.push(reason),
    );
    expect(reasons).toHaveLength(0);
    await Promise.resolve();
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/restarting/i);
    expect(() => off()).not.toThrow();
    expect(connectNativeMock).toHaveBeenCalledTimes(1);
  });

  it('a backoff-window send without a disconnect handler stays silent (caller timeout covers it)', async () => {
    const portA = mockPort();
    connectNativeMock.mockReturnValueOnce(portA);
    send({ v: 1, kind: 'ping', id: 'a' }, () => {});
    portA._disconnect();
    expect(() => send({ v: 1, kind: 'ping', id: 'b' }, () => {})).not.toThrow();
    await Promise.resolve();
  });

  it('warm() fails fast when the port dies instead of waiting out its timeout', async () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const p = warm('claude', 30_000);
    port._disconnect();
    await expect(p).resolves.toBe('error');
  });

  it('reconnect-storm: cold-fail disconnects engage exponential backoff', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const portA = mockPort();
    const portB = mockPort();
    connectNativeMock.mockReturnValueOnce(portA).mockReturnValueOnce(portB);
    send({ v: 1, kind: 'ping', id: 'a' }, () => {});
    // Cold-fail: host disconnects before any frame lands.
    portA._disconnect();
    // Immediate re-send is refused: backoff window still open.
    send({ v: 1, kind: 'ping', id: 'b' }, () => {});
    expect(connectNativeMock).toHaveBeenCalledTimes(1);
    // Past first backoff window (400ms), next send reconnects.
    vi.setSystemTime(500);
    send({ v: 1, kind: 'ping', id: 'b' }, () => {});
    expect(connectNativeMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('a received frame resets the backoff counter', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const portA = mockPort();
    const portB = mockPort();
    const portC = mockPort();
    connectNativeMock
      .mockReturnValueOnce(portA)
      .mockReturnValueOnce(portB)
      .mockReturnValueOnce(portC);
    // First cold-fail bumps counter to 1.
    send({ v: 1, kind: 'ping', id: 'a' }, () => {});
    portA._disconnect();
    vi.setSystemTime(500);
    // Second connect succeeds (frame received), counter resets.
    send({ v: 1, kind: 'ping', id: 'b' }, () => {});
    portB._emit({ v: 1, id: 'b', type: 'done' });
    portB._disconnect();
    // Disconnect after a received frame does NOT engage backoff.
    send({ v: 1, kind: 'ping', id: 'c' }, () => {});
    expect(connectNativeMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('cancel posts the cancel frame on an alive port', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    send({ v: 1, kind: 'translate', id: 'rid' }, () => {});
    port.postMessage.mockClear();
    cancel('rid');
    expect(port.postMessage).toHaveBeenCalledWith({ v: 1, kind: 'cancel', id: 'rid' });
  });

  it('cancel is a no-op when no port has been spawned', () => {
    expect(() => cancel('rid')).not.toThrow();
    expect(connectNativeMock).not.toHaveBeenCalled();
  });

  it('cancel is a no-op when the port is disconnected', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    send({ v: 1, kind: 'ping', id: 'a' }, () => {});
    port._disconnect();
    port.postMessage.mockClear();
    expect(() => cancel('rid')).not.toThrow();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('send swallows postMessage throws so a dying port does not break callers', () => {
    const port = mockPort();
    port.postMessage.mockImplementation(() => {
      throw new Error('port closed');
    });
    connectNativeMock.mockReturnValue(port);
    expect(() => send({ v: 1, kind: 'ping' }, () => {})).not.toThrow();
  });

  it('warm() sends a warm-session frame with the provider on the backend field', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    void warm('claude');
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    const sent = port.postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent['v']).toBe(1);
    expect(sent['kind']).toBe('warm-session');
    expect(sent['backend']).toBe('claude');
    expect(typeof sent['id']).toBe('string');
  });

  it('warm() resolves "done" on the matching done frame and detaches the listener', async () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const p = warm('claude');
    const sentId = (port.postMessage.mock.calls[0]?.[0] as { id: string }).id;
    port._emit({ v: 1, id: sentId, type: 'done' });
    await expect(p).resolves.toBe('done');
  });

  it('warm() resolves "error" on a matching error frame', async () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const p = warm('codex');
    const sentId = (port.postMessage.mock.calls[0]?.[0] as { id: string }).id;
    port._emit({ v: 1, id: sentId, type: 'error', code: 'UNSUPPORTED' });
    await expect(p).resolves.toBe('error');
  });

  it('warm() resolves "timeout" when no terminal frame arrives in budget', async () => {
    vi.useFakeTimers();
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const p = warm('claude', 100);
    vi.advanceTimersByTime(150);
    await expect(p).resolves.toBe('timeout');
    vi.useRealTimers();
  });

  it('warm() ignores frames addressed to a different id', async () => {
    vi.useFakeTimers();
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    const p = warm('claude', 200);
    port._emit({ v: 1, id: 'someone-else', type: 'done' });
    vi.advanceTimersByTime(300);
    await expect(p).resolves.toBe('timeout');
    vi.useRealTimers();
  });

  it('send() onPortDisconnect fires when the port disconnects mid-flight', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    let disconnectFired = 0;
    send(
      { v: 1, kind: 'translate', id: 'mid-flight' },
      () => {},
      () => {
        disconnectFired += 1;
      },
    );
    expect(disconnectFired).toBe(0);
    port._disconnect();
    expect(disconnectFired).toBe(1);
    // Idempotent: a second disconnect of the same dead port is a no-op
    // (subscribers were cleared after the first dispatch).
    port._disconnect();
    expect(disconnectFired).toBe(1);
  });

  it('send() unsubscribe detaches both the frame and disconnect handlers', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    let frameCount = 0;
    let disconnectFired = 0;
    const off = send(
      { v: 1, kind: 'translate', id: 'detach' },
      () => {
        frameCount += 1;
      },
      () => {
        disconnectFired += 1;
      },
    );
    off();
    port._emit({ v: 1, id: 'detach', type: 'delta', text: 'x' });
    port._disconnect();
    expect(frameCount).toBe(0);
    expect(disconnectFired).toBe(0);
  });

  it('multiple in-flight subscribers all receive the disconnect signal', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    let countA = 0;
    let countB = 0;
    send(
      { v: 1, kind: 'translate', id: 'a' },
      () => {},
      () => {
        countA += 1;
      },
    );
    send(
      { v: 1, kind: 'translate', id: 'b' },
      () => {},
      () => {
        countB += 1;
      },
    );
    port._disconnect();
    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });

  it('disconnect handler that throws does not abort fan-out to siblings', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    let bDelivered = false;
    send(
      { v: 1, kind: 'translate', id: 'a' },
      () => {},
      () => {
        throw new Error('boom');
      },
    );
    send(
      { v: 1, kind: 'translate', id: 'b' },
      () => {},
      () => {
        bDelivered = true;
      },
    );
    port._disconnect();
    expect(bDelivered).toBe(true);
  });

  it('resetPortManagerForTest clears state', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    send({ v: 1, kind: 'ping' }, () => {});
    port._emit({ v: 1, kind: 'session', provider: 'claude', state: 'spawned' });
    expect(getStatus()).toBe('warm');
    resetPortManagerForTest();
    expect(getStatus()).toBe('cold');
  });
});
