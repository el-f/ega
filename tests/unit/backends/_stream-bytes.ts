import { TextEncoder } from 'node:util';

const enc = new TextEncoder();

/** One timed enqueue: `afterMs` is the gap since the previous step. */
export interface ByteStep {
  afterMs: number;
  text: string;
}

/** A body that emits each step on the fake-timer clock, then closes. */
export function pacedBody(steps: ByteStep[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let at = 0;
      for (const step of steps) {
        at += step.afterMs;
        setTimeout(() => {
          try {
            controller.enqueue(enc.encode(step.text));
          } catch {
            /* already canceled */
          }
        }, at);
      }
      setTimeout(() => {
        try {
          controller.close();
        } catch {
          /* already canceled */
        }
      }, at + 1);
    },
  });
}

/** Cuts the payload's bytes at splitAt, so a multi-byte character can straddle two chunks. */
export function streamFromBytes(payload: string, splitAt: number[]): ReadableStream<Uint8Array> {
  const bytes = enc.encode(payload);
  const bounds = [0, ...splitAt.filter((n) => n > 0 && n < bytes.length).sort((a, b) => a - b)];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bounds.length; i++) {
        const start = bounds[i] ?? 0;
        const end = bounds[i + 1] ?? bytes.length;
        if (end > start) controller.enqueue(bytes.slice(start, end));
      }
      controller.close();
    },
  });
}
