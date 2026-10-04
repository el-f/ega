import { describe, it, expect } from 'vitest';
import {
  SseBufferOverflowError,
  iterNdjsonLines,
  iterSseDataPayloads,
} from '@/shared/backends/sseParser';
import { streamBytes } from '@/shared/backends/stream-resilience';
import { streamFromBytes } from './_stream-bytes';

// Shared by anthropic, openai, gemini, groq and deepseek: a break here corrupts all five streams.

function streamFrom(...chunks: string[]): AsyncIterable<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return streamBytes(
    new ReadableStream<Uint8Array>({
      pull(c) {
        if (i >= chunks.length) {
          c.close();
          return;
        }
        const chunk = chunks[i++];
        c.enqueue(enc.encode(chunk ?? ''));
      },
    }),
  );
}

async function collect(g: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const v of g) out.push(v);
  return out;
}

describe('iterSseDataPayloads', () => {
  it("yields each event's data payload trimmed", async () => {
    const body = streamFrom('data: hello\n\n', 'data: world\n\n');
    expect(await collect(iterSseDataPayloads(body))).toEqual(['hello', 'world']);
  });

  it('strips the leading single space after `data:` per SSE spec', async () => {
    const body = streamFrom('data: a\n\ndata:b\n\n');
    expect(await collect(iterSseDataPayloads(body))).toEqual(['a', 'b']);
  });

  it('normalizes CRLF line endings to LF', async () => {
    // Some upstream proxies emit \r\n\r\n terminators.
    const body = streamFrom('data: one\r\n\r\ndata: two\r\n\r\n');
    expect(await collect(iterSseDataPayloads(body))).toEqual(['one', 'two']);
  });

  it('flushes a tail that already begins with a blank line', async () => {
    // The tail flush keys on the buffer not ENDING with a terminator; keying on the start loses this event.
    const body = streamFrom('data: first\n\n', '\n\ndata: second');
    expect(await collect(iterSseDataPayloads(body))).toEqual(['first', 'second']);
  });

  it('strips exactly one space per data line, not every leading space', async () => {
    const body = streamFrom('data: a\ndata:  b\n\n');
    expect(await collect(iterSseDataPayloads(body))).toEqual(['a\n b']);
  });

  it('flushes the trailing event when the server closes without `\\n\\n`', async () => {
    const body = streamFrom('data: lone\n');
    expect(await collect(iterSseDataPayloads(body))).toEqual(['lone']);
  });

  it('flushes when the server closes mid-line without any newline', async () => {
    const body = streamFrom('data: noterm');
    expect(await collect(iterSseDataPayloads(body))).toEqual(['noterm']);
  });

  it('yields the `[DONE]` sentinel — consumers use it as the terminal frame', async () => {
    const body = streamFrom('data: real\n\ndata: [DONE]\n\n');
    expect(await collect(iterSseDataPayloads(body))).toEqual(['real', '[DONE]']);
  });

  it('skips comment-only events (no data: prefix lines)', async () => {
    const body = streamFrom(': keepalive\n\ndata: actual\n\n');
    expect(await collect(iterSseDataPayloads(body))).toEqual(['actual']);
  });

  it('concatenates multi-line `data:` blocks per SSE spec', async () => {
    const body = streamFrom('data: line1\ndata: line2\n\n');
    expect(await collect(iterSseDataPayloads(body))).toEqual(['line1\nline2']);
  });

  it('handles event boundaries that fall across chunk boundaries', async () => {
    const body = streamFrom('data: par', 't1\n\ndata: par', 't2\n\n');
    expect(await collect(iterSseDataPayloads(body))).toEqual(['part1', 'part2']);
  });

  it('handles a chunk that is only whitespace at end-of-stream', async () => {
    // A whitespace-only tail still gets a synthesized terminator; it must yield no extra event.
    const body = streamFrom('data: ok\n\n', '\n');
    expect(await collect(iterSseDataPayloads(body))).toEqual(['ok']);
  });

  it('returns empty for an empty stream', async () => {
    const body = streamFrom();
    expect(await collect(iterSseDataPayloads(body))).toEqual([]);
  });

  it('discards events with payload that trims to empty string', async () => {
    const body = streamFrom('data:   \n\ndata: real\n\n');
    expect(await collect(iterSseDataPayloads(body))).toEqual(['real']);
  });

  it('releases the reader lock when the consumer breaks early', async () => {
    // A reader that keeps the body lock holds the socket open until GC.
    let cancelled = false;
    const enc = new TextEncoder();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulls++;
        if (pulls > 5) {
          c.close();
          return;
        }
        c.enqueue(enc.encode(`data: e${pulls}\n\n`));
      },
      cancel() {
        cancelled = true;
      },
    });
    const gen = iterSseDataPayloads(streamBytes(body));
    const first = await gen.next();
    expect(first.value).toBe('e1');
    await gen.return(undefined);
    expect(cancelled).toBe(true);
  });
});

describe('CRLF terminators split across chunk boundaries', () => {
  it('keeps events separate when the blank line is split between CR and LF', async () => {
    const out = await collect(
      iterSseDataPayloads(streamFrom('data: one\r\n\r', '\ndata: two\r\n\r\n')),
    );
    expect(out).toEqual(['one', 'two']);
  });

  it('handles a CRLF split mid-line', async () => {
    const out = await collect(iterSseDataPayloads(streamFrom('data: alpha\r', '\n\r\n')));
    expect(out).toEqual(['alpha']);
  });
});

describe('buffer cap', () => {
  it('throws SseBufferOverflowError when no event boundary arrives within 1MB', async () => {
    const piece = 'data: x'.padEnd(65_536, 'x');
    const chunks = Array.from({ length: 17 }, () => piece);
    await expect(collect(iterSseDataPayloads(streamFrom(...chunks)))).rejects.toBeInstanceOf(
      SseBufferOverflowError,
    );
  });

  it('a flowing stream with event boundaries never trips the cap', async () => {
    const event = `data: ${'y'.repeat(65_536)}\n\n`;
    const chunks = Array.from({ length: 20 }, () => event);
    const out = await collect(iterSseDataPayloads(streamFrom(...chunks)));
    expect(out).toHaveLength(20);
  });

  it('accepts a buffer of exactly 1MB and refuses the character after it', async () => {
    const CAP = 1_048_576;
    const atCap = `data: ${'x'.repeat(CAP - 6)}`;
    expect(atCap).toHaveLength(CAP);

    await expect(collect(iterSseDataPayloads(streamFrom(atCap)))).resolves.toEqual([
      atCap.slice(6),
    ]);
    await expect(collect(iterSseDataPayloads(streamFrom(`${atCap}x`)))).rejects.toBeInstanceOf(
      SseBufferOverflowError,
    );
  });

  it('names itself, so a PROTOCOL log line says which ceiling blew', () => {
    const err = new SseBufferOverflowError();

    expect(err.name).toBe('SseBufferOverflowError');
    expect(err.message).toContain('SSE buffer exceeded 1MB');
  });
});

describe('iterNdjsonLines', () => {
  it('yields one record per line and skips blank lines', async () => {
    const out = await collect(iterNdjsonLines(streamFrom('{"a":1}\n', '\n{"b":2}\n')));
    expect(out).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('yields an unterminated final line — Ollama drops the last newline on some builds', async () => {
    const out = await collect(iterNdjsonLines(streamFrom('{"a":1}\n{"done":true}')));
    expect(out).toEqual(['{"a":1}', '{"done":true}']);
  });

  it('joins a record split across chunk boundaries', async () => {
    const out = await collect(iterNdjsonLines(streamFrom('{"a":', '1}')));
    expect(out).toEqual(['{"a":1}']);
  });

  it('throws SseBufferOverflowError when no newline arrives within 1MB', async () => {
    const chunks = Array.from({ length: 17 }, () => 'x'.repeat(65_536));
    await expect(collect(iterNdjsonLines(streamFrom(...chunks)))).rejects.toBeInstanceOf(
      SseBufferOverflowError,
    );
  });

  it('survives a split inside a multi-byte codepoint, like the SSE reader does', async () => {
    // Ollama and the native host stream NDJSON; a byte cut here corrupted the translation.
    const payload = `{"response":"مرحبا 你好 🙂"}\n`;
    const whole = await collect(iterNdjsonLines(streamBytes(streamFromBytes(payload, []))));

    for (const cut of [14, 15, 16, 17, 20, 25]) {
      const split = await collect(iterNdjsonLines(streamBytes(streamFromBytes(payload, [cut]))));
      expect(split).toEqual(whole);
    }
    expect(JSON.parse(whole[0] ?? '{}')).toEqual({ response: 'مرحبا 你好 🙂' });
  });

  it('trims each record and the unterminated tail', async () => {
    const out = await collect(iterNdjsonLines(streamFrom('  {"a":1}  \n\t{"b":2}\t')));
    expect(out).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('drops a tail that is only whitespace', async () => {
    expect(await collect(iterNdjsonLines(streamFrom('{"a":1}\n   ')))).toEqual(['{"a":1}']);
  });

  it('accepts a line of exactly 1MB and refuses the character after it', async () => {
    const CAP = 1_048_576;
    await expect(
      collect(iterNdjsonLines(streamFrom(`${'x'.repeat(CAP - 1)}\n`))),
    ).resolves.toHaveLength(1);
    await expect(collect(iterNdjsonLines(streamFrom('x'.repeat(CAP + 1))))).rejects.toBeInstanceOf(
      SseBufferOverflowError,
    );
  });
});
