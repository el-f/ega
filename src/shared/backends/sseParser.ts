/** A `data:`-less body must not grow the buffer without bound; consumers surface this as PROTOCOL. */
export class SseBufferOverflowError extends Error {
  constructor() {
    super('SSE buffer exceeded 1MB without a complete event');
    this.name = 'SseBufferOverflowError';
  }
}

/** Shared with the NDJSON reader so both line protocols share one ceiling. */
const MAX_STREAM_BUFFER_CHARS = 1_048_576;

/** Yields one trimmed `data:` payload per SSE event; each backend parses its own payload shape. */
export async function* iterSseDataPayloads(
  bytes: AsyncIterable<Uint8Array>,
): AsyncGenerator<string> {
  const dec = new TextDecoder();
  let buf = '';

  function* drain(flushTail: boolean): Generator<string> {
    if (flushTail && !buf.endsWith('\n\n')) {
      buf += '\n\n';
    }
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const event = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      // SSE allows several `data:` lines per event, joined with `\n`.
      let payload = '';
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const piece = line.slice(5).replace(/^ /, '');
        payload += (payload ? '\n' : '') + piece;
      }
      const trimmed = payload.trim();
      if (!trimmed) continue;
      // `[DONE]` is yielded: it is OpenAI's terminal frame, and JSON-parsing consumers skip it anyway.
      yield trimmed;
    }
  }

  for await (const value of bytes) {
    buf += dec.decode(value, { stream: true });
    // Buffer, not chunk: a CRLF split across chunks would match neither half. Trailing CR pends.
    const pendingCr = buf.endsWith('\r');
    buf = (pendingCr ? buf.slice(0, -1) : buf).replace(/\r\n/g, '\n') + (pendingCr ? '\r' : '');
    yield* drain(false);
    if (buf.length > MAX_STREAM_BUFFER_CHARS) throw new SseBufferOverflowError();
  }
  yield* drain(true);
}

/** Yields one non-blank NDJSON line per record, an unterminated tail last; same ceiling as SSE. */
export async function* iterNdjsonLines(bytes: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const dec = new TextDecoder();
  let buf = '';
  for await (const value of bytes) {
    buf += dec.decode(value, { stream: true });
    if (buf.length > MAX_STREAM_BUFFER_CHARS) throw new SseBufferOverflowError();
    let idx: number;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) yield line;
    }
  }
  const tail = buf.trim();
  if (tail) yield tail;
}
