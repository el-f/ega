/** Stream helpers shared by every streaming backend, kept here so no backend imports a sibling. */

/** Aborts a stream that goes silent (proxy hang, half-open socket) long before the wall-clock timeout. */
export const STREAM_IDLE_TIMEOUT_MS = 30_000;

/** The watchdog wraps raw bytes, not parsed events: heartbeats and long reasoning phases yield bytes but no events. */
export async function* streamBytes(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    // Frees the socket on every exit path, including a consumer `break`.
    await reader.cancel().catch(() => {});
  }
}

/** Throws TimeoutError after idleMs with no value; onIdle must tear down the transport, since the parked read() never settles. */
export async function* withIdleTimeout<T>(
  source: AsyncIterable<T>,
  idleMs: number,
  onIdle: () => void,
): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    for (;;) {
      const idle = new Promise<never>((_resolve, reject) => {
        idleTimer = setTimeout(() => {
          onIdle();
          reject(new DOMException('stream idle timeout', 'TimeoutError'));
        }, idleMs);
      });
      let step: IteratorResult<T>;
      try {
        step = await Promise.race([iterator.next(), idle]);
      } finally {
        clearTimeout(idleTimer);
      }
      if (step.done) return;
      yield step.value;
    }
  } finally {
    // Do not await return(): on the timeout path the source is stalled inside reader.read() and would never settle.
    void iterator.return?.();
  }
}

/** User cancel plus idle abort; aborting frees a stalled read, while body.cancel() throws on a locked stream. */
export function idleAbort(userSignal: AbortSignal | undefined): {
  signal: AbortSignal;
  abort: () => void;
} {
  const ctrl = new AbortController();
  const signal = userSignal ? AbortSignal.any([userSignal, ctrl.signal]) : ctrl.signal;
  return { signal, abort: () => ctrl.abort() };
}

// Clamp a server Retry-After hint so a huge value (or far-future date) can't freeze the batch for minutes or overflow a 32-bit setTimeout.
const RETRY_AFTER_MAX_MS = 60_000;

/** Both Retry-After forms to ms; past dates clamp to 0, huge values to RETRY_AFTER_MAX_MS; undefined = no hint. */
export function parseRetryAfterMs(header: string | null): number | undefined {
  if (header === null) return undefined;
  const trimmed = header.trim();
  if (trimmed.length === 0) return undefined;
  if (/^\d+$/.test(trimmed)) return Math.min(RETRY_AFTER_MAX_MS, Number(trimmed) * 1000);
  // Date.parse reads a bare "-5" as a year, so require a letter, which every HTTP-date has.
  if (!/[a-z]/i.test(trimmed)) return undefined;
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return undefined;
  return Math.min(RETRY_AFTER_MAX_MS, Math.max(0, dateMs - Date.now()));
}

/** retryAfterMs for a 429/503/529 response, else {}; the page-translate scheduler uses it as its backoff floor. */
export function retryAfterFields(res: Response): { retryAfterMs?: number } {
  if (res.status !== 429 && res.status !== 503 && res.status !== 529) return {};
  const ms = parseRetryAfterMs(res.headers.get('retry-after'));
  return ms !== undefined ? { retryAfterMs: ms } : {};
}
