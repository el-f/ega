import type { TranslationChunk } from '@/shared/types';

/** Both the attempt's ABORTED rewrite and the router's own synthesis use this
 *  wording, so the surface cannot tell the two timeout sources apart. */
export const TRANSLATE_TIMED_OUT =
  'No answer before the text answer timeout. Try again, or raise it in Settings → Answers.';
export const IMAGE_TIMED_OUT =
  'No answer before the image answer timeout. Try again, or raise it in Settings → Answers.';

/** One request's outbound chunk stream. Holds the invariant every surface
 *  relies on: at most one terminal chunk, and nothing after it. */
export interface ChunkSink {
  emit(c: TranslationChunk): void;
  sawTerminal(): boolean;
}

/**
 * Drops everything after the first done/error: a backend that ignores abort can send a late done that revives a failed turn.
 */
export function createTerminalLatch(forward: (c: TranslationChunk) => void): ChunkSink {
  let closed = false;
  return {
    emit(c) {
      if (closed) return;
      if (c.type !== 'delta') closed = true;
      forward(c);
    },
    sawTerminal: () => closed,
  };
}

/**
 * Buffers deltas for delayMs; a terminal chunk flushes the buffer first. delayMs 0 = pass-through.
 */
export function wrapOnChunkForStreamingFlush(
  forward: (c: TranslationChunk) => void,
  delayMs: number,
): (c: TranslationChunk) => void {
  if (delayMs === 0) return forward;

  let pending: { requestId: string; text: string } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (pending) {
      forward({ type: 'delta', requestId: pending.requestId, text: pending.text });
      pending = undefined;
    }
  }

  return (c: TranslationChunk): void => {
    if (c.type === 'delta') {
      if (pending?.requestId !== c.requestId) {
        flush();
        pending = { requestId: c.requestId, text: c.text };
      } else {
        pending.text += c.text;
      }
      timer ??= setTimeout(flush, delayMs);
      return;
    }
    flush();
    forward(c);
  };
}
