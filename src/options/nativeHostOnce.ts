import { debugCatch } from '@/shared/logger';
import { DEFAULT_LOCAL_BACKEND_TIMEOUT_MS, NATIVE_HOST_NAME } from '@/shared/constants';
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

/** Hosts before v10 never reply, so the timeout path returns [] and the UI falls back to free-text entry. */
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
    timeoutMs,
    (msg, settle) => {
      if (msg.type === 'models' && Array.isArray(msg['models'])) {
        received = (msg['models'] as unknown[]).filter((x): x is string => typeof x === 'string');
      } else if (msg.type === 'done') settle(received);
      else if (msg.type === 'error') settle([]);
    },
    () => [],
  );
}

/** CLI id to path, or null when not on PATH; an old host times out into {}. */
export function probeNativeCli(
  timeoutMs: number = DEFAULT_LOCAL_BACKEND_TIMEOUT_MS,
): Promise<Record<string, string | null>> {
  let received: Record<string, string | null> = {};
  return requestNativeHostOnce<Record<string, string | null>>(
    { v: 1, kind: 'probe-cli', id: `ega-probe-cli-${uuid()}` },
    timeoutMs,
    (msg, settle) => {
      const cli = msg['cli'];
      if (msg.type === 'cli-presence' && cli && typeof cli === 'object') {
        const filtered: Record<string, string | null> = {};
        for (const [k, v] of Object.entries(cli as Record<string, unknown>)) {
          if (typeof v === 'string' || v === null) filtered[k] = v;
        }
        received = filtered;
      } else if (msg.type === 'done') settle(received);
      else if (msg.type === 'error') settle({});
    },
    () => ({}),
  );
}
