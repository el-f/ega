import { NATIVE_HOST_NAME } from '@/shared/constants';
import { uuid } from '@/shared/uuid';

type FrameHandler = (msg: unknown) => void;

export type PortStatus = 'cold' | 'connecting' | 'warm' | 'disconnected';

type DisconnectHandler = (reason?: string) => void;

interface ManagedPort {
  port: chrome.runtime.Port;
  handlers: Set<FrameHandler>;
  disconnectHandlers: Set<DisconnectHandler>;
  alive: boolean;
  /** Set on the first inbound frame; a successful warm-up resets the reconnect backoff. */
  receivedFrame: boolean;
}

let current: ManagedPort | null = null;
let status: PortStatus = 'cold';
// The host process outlives its CLI children, so an open port does not mean the CLI is still warm.
const cliWarmByProvider = new Map<string, boolean>();

// A host that crashes on every spawn would get a fresh port per send, and Chrome rate-limits far too late.
let reconnectFailures = 0;
let reconnectAt = 0;
const BACKOFF_BASE_MS = 200;
const BACKOFF_CAP_MS = 30_000;

function nextBackoff(): number {
  return Math.min(2 ** reconnectFailures * BACKOFF_BASE_MS, BACKOFF_CAP_MS);
}

function anyCliWarm(): boolean {
  for (const v of cliWarmByProvider.values()) if (v) return true;
  return false;
}

function recomputeStatus(): void {
  if (!current?.alive) return;
  if (!current.receivedFrame) {
    status = 'connecting';
    return;
  }
  status = anyCliWarm() ? 'warm' : 'connecting';
}

export function getStatus(): PortStatus {
  return status;
}

export function send(
  frame: Record<string, unknown>,
  onFrame: FrameHandler,
  onPortDisconnect?: DisconnectHandler,
): () => void {
  const m = ensurePort();
  if (m === null) {
    // Backoff window: the frame is dropped — microtask lets the caller finish wiring before the fail-fast lands.
    if (onPortDisconnect) {
      queueMicrotask(() => onPortDisconnect('native host is restarting after a crash'));
    }
    return () => {};
  }
  m.handlers.add(onFrame);
  if (onPortDisconnect) m.disconnectHandlers.add(onPortDisconnect);
  try {
    m.port.postMessage(frame);
  } catch {
    /* port died mid-flight; next send will reconnect via ensurePort */
  }
  return () => {
    m.handlers.delete(onFrame);
    if (onPortDisconnect) m.disconnectHandlers.delete(onPortDisconnect);
  };
}

export function cancel(id: string): void {
  if (!current?.alive) return;
  try {
    current.port.postMessage({ v: 1, kind: 'cancel', id });
  } catch {
    /* ignore — target frame is already gone */
  }
}

/** One request/reply on the shared port with timer, unsubscribe and port-death handling; onFrame filters and calls settle. */
function request<T>(
  frame: Record<string, unknown>,
  opts: {
    timeoutMs: number;
    timeoutValue: T;
    /** Resolved on port death instead of waiting out the timeout. Defaults to `timeoutValue`. */
    disconnectValue?: T;
    onFrame: (msg: unknown, settle: (v: T) => void) => void;
  },
): Promise<T> {
  const { timeoutMs, timeoutValue, disconnectValue = timeoutValue, onFrame } = opts;
  return new Promise<T>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: () => void = () => {};
    const settle = (v: T): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
      resolve(v);
    };
    unsubscribe = send(
      frame,
      (msg) => onFrame(msg, settle),
      () => settle(disconnectValue),
    );
    timer = setTimeout(() => settle(timeoutValue), timeoutMs);
  });
}

/** Asks the host to start the CLI before the first translate; fire-and-forget, any terminal frame ends the wait. */
export function warm(
  provider: string,
  timeoutMs = 30_000,
  model?: string,
): Promise<'done' | 'error' | 'timeout'> {
  const id = `ega-warm-${provider}-${Date.now().toString(36)}`;
  // The host keys the child by model, so a warm child on another model dies at the first real translate.
  return request<'done' | 'error' | 'timeout'>(
    { v: 1, kind: 'warm-session', id, backend: provider, ...(model ? { model } : {}) },
    {
      timeoutMs,
      timeoutValue: 'timeout',
      disconnectValue: 'error',
      onFrame: (m, settle) => {
        const f = m as { id?: string; type?: string } | null;
        if (f?.id !== id) return;
        if (f.type === 'done') settle('done');
        else if (f.type === 'error') settle('error');
      },
    },
  );
}

/** Uses the shared port: a port per isAvailable call would let two clicks spawn two racing hosts. */
export function ping(timeoutMs: number): Promise<boolean> {
  const probeId = `ega-probe-pm-${uuid()}`;
  return request<boolean>(
    { v: 1, kind: 'ping', id: probeId },
    {
      timeoutMs,
      timeoutValue: false,
      onFrame: (m, settle) => {
        const f = m as { id?: string; type?: string } | null;
        if (f?.id !== probeId) return;
        if (f.type === 'done') settle(true);
        else if (f.type === 'error') settle(false);
      },
    },
  );
}

export function resetPortManagerForTest(): void {
  if (current?.alive) {
    current.disconnectHandlers.clear();
    current.handlers.clear();
    try {
      current.port.disconnect();
    } catch {
      /* swallow */
    }
  }
  current = null;
  status = 'cold';
  reconnectFailures = 0;
  reconnectAt = 0;
  cliWarmByProvider.clear();
}

function ensurePort(): ManagedPort | null {
  if (current?.alive) return current;
  if (Date.now() < reconnectAt) return null;
  cliWarmByProvider.clear();
  status = 'connecting';
  const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  const managed: ManagedPort = {
    port,
    handlers: new Set(),
    disconnectHandlers: new Set(),
    alive: true,
    receivedFrame: false,
  };
  port.onMessage.addListener((m) => {
    if (!managed.receivedFrame) {
      managed.receivedFrame = true;
      reconnectFailures = 0;
      reconnectAt = 0;
    }
    // Lifecycle frame from CliSessionManager, so the chip stops reporting warm after the host reaps the child.
    const frame = m as { kind?: string; provider?: string; state?: string } | null;
    if (frame?.kind === 'session' && typeof frame.provider === 'string') {
      if (frame.state === 'spawned') cliWarmByProvider.set(frame.provider, true);
      else if (frame.state === 'reaped') cliWarmByProvider.set(frame.provider, false);
    }
    recomputeStatus();
    managed.handlers.forEach((h) => h(m));
  });
  port.onDisconnect.addListener(() => {
    // Must be read synchronously here: Chrome exposes lastError only during
    // this dispatch, and logs "Unchecked runtime.lastError" if nobody looks.
    const reason = chrome.runtime.lastError?.message;
    managed.alive = false;
    // Snapshot and clear before firing, or a re-entrant send inside a handler sees subscribers from the dead port.
    const ds = [...managed.disconnectHandlers];
    managed.disconnectHandlers.clear();
    managed.handlers.clear();
    if (current === managed) {
      current = null;
      status = 'disconnected';
      cliWarmByProvider.clear();
      if (!managed.receivedFrame) {
        reconnectFailures++;
        reconnectAt = Date.now() + nextBackoff();
      }
    }
    // In-flight subscribers get a terminal error here, or they hang until their caller's wallclock fires.
    for (const h of ds) {
      try {
        h(reason);
      } catch {
        /* subscriber callbacks are best-effort */
      }
    }
  });
  current = managed;
  // 'connecting' until BOTH the first host frame lands and a CLI subprocess spawns — `connectNative` returning proves neither, and the diagnostic chip reads this.
  return managed;
}
