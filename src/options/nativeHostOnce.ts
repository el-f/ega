import { debugCatch } from '@/shared/logger';
import {
  DEFAULT_LOCAL_BACKEND_TIMEOUT_MS,
  NATIVE_COLD_BOOT_TIMEOUT_MS,
  NATIVE_HOST_NAME,
} from '@/shared/constants';
import { uuid } from '@/shared/uuid';

export interface HostFrame {
  id?: string;
  type?: string;
  [k: string]: unknown;
}

export type OnceEnd =
  | { kind: 'timeout' }
  | { kind: 'disconnect'; lastError?: string }
  | { kind: 'throw'; message: string };

/** One request on a port of its own, closed when it settles: the host exits with it, so the options page never keeps one alive. */
export function requestNativeHostOnce<T>(
  frame: { id: string } & Record<string, unknown>,
  timeoutMs: number,
  onFrame: (msg: HostFrame, settle: (v: T) => void) => void,
  onEnd: (end: OnceEnd) => T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    } catch (e) {
      return resolve(onEnd({ kind: 'throw', message: (e as Error).message }));
    }
    let settled = false;
    // Armed before the frame goes out, so a postMessage throw can settle without a half-declared timer.
    const timer = setTimeout(() => settle(onEnd({ kind: 'timeout' })), timeoutMs);
    const settle = (v: T): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        port.disconnect();
      } catch (e) {
        debugCatch(e, 'options.nativeHostOnce.disconnect');
      }
      resolve(v);
    };
    port.onDisconnect.addListener(() => {
      // Chrome clears lastError once this listener returns — read it here, not later.
      const lastError = chrome.runtime.lastError?.message;
      settle(onEnd(lastError ? { kind: 'disconnect', lastError } : { kind: 'disconnect' }));
    });
    port.onMessage.addListener((m: unknown) => {
      const msg = m as HostFrame;
      // Per-call id so an unrelated frame on this port can't settle the request.
      if (msg.id !== frame.id) return;
      onFrame(msg, settle);
    });
    try {
      port.postMessage(frame);
    } catch (e) {
      settle(onEnd({ kind: 'throw', message: (e as Error).message }));
    }
  });
}

/** Each call starts a host process, so it waits out a cold boot; an old host that never replies times out into [] and the UI takes a typed id. */
export function listNativeModels(
  cli: string | undefined,
  timeoutMs: number = DEFAULT_LOCAL_BACKEND_TIMEOUT_MS,
): Promise<string[]> {
  let received: string[] = [];
  return requestNativeHostOnce<string[]>(
    {
      v: 1,
      kind: 'list-models',
      id: `ega-list-models-${uuid()}`,
      ...(cli ? { backend: cli } : {}),
    },
    Math.max(timeoutMs, NATIVE_COLD_BOOT_TIMEOUT_MS),
    (msg, settle) => {
      if (msg.type === 'models' && Array.isArray(msg['models'])) {
        received = (msg['models'] as unknown[]).filter((x): x is string => typeof x === 'string');
      } else if (msg.type === 'done') settle(received);
      else if (msg.type === 'error') settle([]);
    },
    () => [],
  );
}

export interface CliProbe {
  /** CLI id to its path, or null when not on PATH. */
  cli: Record<string, string | null>;
  /** CLI id to its login state; null when the host could not tell. Absent from a host before v4. */
  loggedIn: Record<string, boolean | null>;
}

function pick<T>(raw: unknown, keep: (v: unknown) => v is T): Record<string, T> {
  const out: Record<string, T> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (keep(v)) out[k] = v;
  return out;
}

/** Waits out a cold boot like listNativeModels. A timeout keeps what arrived: presence comes before the slower login checks. */
export function probeNativeCli(
  timeoutMs: number = DEFAULT_LOCAL_BACKEND_TIMEOUT_MS,
): Promise<CliProbe> {
  const empty = (): CliProbe => ({ cli: {}, loggedIn: {} });
  let received = empty();
  return requestNativeHostOnce<CliProbe>(
    { v: 1, kind: 'probe-cli', id: `ega-probe-cli-${uuid()}` },
    Math.max(timeoutMs, NATIVE_COLD_BOOT_TIMEOUT_MS),
    (msg, settle) => {
      if (msg.type === 'cli-presence') {
        received = {
          ...received,
          cli: pick(msg['cli'], (v): v is string | null => typeof v === 'string' || v === null),
        };
      } else if (msg.type === 'cli-login') {
        received = {
          ...received,
          loggedIn: pick(
            msg['loggedIn'],
            (v): v is boolean | null => typeof v === 'boolean' || v === null,
          ),
        };
      } else if (msg.type === 'done') settle(received);
      else if (msg.type === 'error') settle(empty());
    },
    () => received,
  );
}
