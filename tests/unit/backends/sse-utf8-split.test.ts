import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { iterSseDataPayloads } from '@/shared/backends/sseParser';
import { streamBytes } from '@/shared/backends/stream-resilience';
import { streamFromBytes } from './_stream-bytes';

// Every string-level fixture cuts on codepoints, so the decoder's streaming flag is untested there.

async function collect(bytes: AsyncIterable<Uint8Array>): Promise<string[]> {
  const out: string[] = [];
  for await (const v of iterSseDataPayloads(bytes)) out.push(v);
  return out;
}

const NON_ASCII = 'مرحبا بالعالم — שלום 你好 🙂 café';

describe('SSE decoding across a multi-byte codepoint boundary', () => {
  it('a split inside an Arabic codepoint does not corrupt the payload', async () => {
    const payload = `data: {"text":"${NON_ASCII}"}\n\n`;
    const byteLen = new TextEncoder().encode(payload).length;
    const whole = await collect(streamBytes(streamFromBytes(payload, [])));
    // Byte 15 lands inside the first Arabic letter's two-byte sequence.
    const split = await collect(streamBytes(streamFromBytes(payload, [15])));
    expect(split).toEqual(whole);
    expect(split[0]).toContain(NON_ASCII);
    expect(byteLen).toBeGreaterThan(payload.length);
  });

  it('any byte split of a non-ASCII stream yields the unsplit payloads', async () => {
    const payload = `data: ${JSON.stringify({ translation: NON_ASCII })}\n\ndata: [DONE]\n\n`;
    const byteLen = new TextEncoder().encode(payload).length;
    const expected = await collect(streamBytes(streamFromBytes(payload, [])));
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: byteLen - 1 }), { minLength: 1, maxLength: 6 }),
        async (cuts) => {
          const got = await collect(streamBytes(streamFromBytes(payload, cuts)));
          expect(got).toEqual(expected);
        },
      ),
      { numRuns: 120 },
    );
  });

  it('a codepoint split across the very last chunk still flushes', async () => {
    const payload = `data: {"t":"é"}`;
    const bytes = new TextEncoder().encode(payload);
    const got = await collect(streamBytes(streamFromBytes(payload, [bytes.length - 1])));
    expect(got).toEqual(['{"t":"é"}']);
  });
});
