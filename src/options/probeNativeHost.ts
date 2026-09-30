import { DEFAULT_LOCAL_BACKEND_TIMEOUT_MS, NATIVE_COLD_BOOT_TIMEOUT_MS } from '@/shared/constants';
import { EXPECTED_HOST_VERSION } from './nativeHostInstall';
import { requestNativeHostOnce } from './nativeHostOnce';
import { uuid } from '@/shared/uuid';

type ProbeStatus = 'installed' | 'outdated' | 'not_installed' | 'error';

export interface ProbeResult {
  status: ProbeStatus;
  /** Undefined when the host predates version reporting; treat that as outdated. */
  installedVersion?: number;
  /** Verbatim `chrome.runtime.lastError.message`; undefined on the timeout and success paths. */
  errorMessage?: string;
}

/** Every probe spawns a host process, so callers inside one short window (the banner poll, the card, a re-render) share one. */
const SHARE_WINDOW_MS = 3_000;
// A probe with a shorter timeout can miss a slow host, so only an equal or longer one is shared.
let inflight: { timeoutMs: number; promise: Promise<ProbeResult> } | null = null;
let last: { at: number; timeoutMs: number; result: ProbeResult } | null = null;

export function _resetProbeNativeHostForTest(): void {
  inflight = null;
  last = null;
}

/** Resolves on whichever lands first: reply is installed, disconnect is not, silence is a timeout. */
export function probeNativeHost(
  timeoutMs: number = DEFAULT_LOCAL_BACKEND_TIMEOUT_MS,
  opts: { fresh?: boolean } = {},
): Promise<ProbeResult> {
  // Every probe starts a new host, so it always pays a cold boot.
  const budget = Math.max(timeoutMs, NATIVE_COLD_BOOT_TIMEOUT_MS);
  // An explicit Recheck shares nothing; the user just installed something and wants to know.
  if (!opts.fresh) {
    if (inflight && inflight.timeoutMs >= budget) return inflight.promise;
    if (last && last.timeoutMs >= budget && Date.now() - last.at < SHARE_WINDOW_MS) {
      return Promise.resolve(last.result);
    }
  }
  const promise: Promise<ProbeResult> = probeNativeHostOnce(budget)
    .then((result) => {
      last = { at: Date.now(), timeoutMs: budget, result };
      return result;
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { timeoutMs: budget, promise };
  return promise;
}

function probeNativeHostOnce(timeoutMs: number): Promise<ProbeResult> {
  return requestNativeHostOnce<ProbeResult>(
    { v: 1, kind: 'ping', id: `ega-options-probe-${uuid()}` },
    timeoutMs,
    (msg, settle) => {
      const version = typeof msg['hostVersion'] === 'number' ? msg['hostVersion'] : undefined;
      // Older hosts no-op on newer frames instead of failing, so flag the gap here.
      const outdated = version === undefined || version < EXPECTED_HOST_VERSION;
      settle(
        version !== undefined
          ? { status: outdated ? 'outdated' : 'installed', installedVersion: version }
          : { status: 'outdated' },
      );
    },
    (end) => {
      if (end.kind === 'throw') return { status: 'error', errorMessage: end.message };
      if (end.kind === 'disconnect' && end.lastError) {
        return { status: 'not_installed', errorMessage: end.lastError };
      }
      return { status: 'not_installed' };
    },
  );
}
