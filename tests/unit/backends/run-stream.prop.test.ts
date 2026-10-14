import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { runStream, type StreamEvent } from '@/shared/backends/base';
import type { TokenUsage, TranslationChunk } from '@/shared/types';

const textArb = fc.constantFrom('{"translation":"', 'hi', 'wor', '\\u0041', '"}', ' ', '{', 'x');

const usageArb: fc.Arbitrary<TokenUsage> = fc.record(
  {
    inputTokens: fc.nat(2000),
    outputTokens: fc.nat(2000),
    cacheReadTokens: fc.nat(2000),
  },
  { requiredKeys: [] },
);

const eventArb: fc.Arbitrary<StreamEvent> = fc.oneof(
  textArb.map((text) => ({ type: 'text', text }) as const),
  usageArb.map((usage) => ({ type: 'usage', usage }) as const),
  fc.constantFrom('end', 'max_tokens').map((reason) => ({ type: 'stop', reason }) as const),
  fc
    .record({
      code: fc.constantFrom('SERVER', 'RATE_LIMIT', 'REQUEST', 'UNKNOWN'),
      message: fc.string({ minLength: 1, maxLength: 12 }),
    })
    .map((e) => ({ type: 'error', ...e }) as const),
);

async function* replay(events: readonly StreamEvent[]): AsyncGenerator<StreamEvent> {
  for (const e of events) yield e;
}

async function run(events: readonly StreamEvent[]): Promise<TranslationChunk[]> {
  const chunks: TranslationChunk[] = [];
  await runStream(replay(events), {
    requestId: 'r1',
    label: 'Test',
    onChunk: (c) => chunks.push(c),
  });
  return chunks;
}

/** Independent of the parser under test: the whole body is one JSON object naming a translation. */
function isWholeAnswer(raw: string): boolean {
  try {
    const o = JSON.parse(raw) as Record<string, unknown> | null;
    return typeof o?.['translation'] === 'string';
  } catch {
    return false;
  }
}

/** A random sequence lands on a complete envelope too rarely to leave the done branch to chance. */
const DONE_EXAMPLE: [StreamEvent[]] = [
  [
    { type: 'text', text: '{"translation":"hi"}' },
    { type: 'stop', reason: 'end' },
  ],
];

/** The contract the shared loop owes every adapter, stated once. */
function expectedTerminal(events: readonly StreamEvent[]): {
  code: string;
  consumed: readonly StreamEvent[];
} {
  const errAt = events.findIndex((e) => e.type === 'error');
  const consumed = errAt === -1 ? events : events.slice(0, errAt + 1);
  const err = consumed[errAt];
  if (err?.type === 'error') return { code: err.code, consumed };
  const stops = consumed.flatMap((e) => (e.type === 'stop' ? [e.reason] : []));
  if (stops.length === 0) return { code: 'PROTOCOL', consumed };
  if (stops.includes('max_tokens')) return { code: 'REQUEST', consumed };
  const raw = consumed.map((e) => (e.type === 'text' ? e.text : '')).join('');
  if (!raw.trim()) return { code: 'EMPTY', consumed };
  // 'text' is the undecided case: transport success is read as an answer by the worker.
  return { code: isWholeAnswer(raw) ? 'done' : 'text', consumed };
}

describe('runStream — the chunk contract, for any event sequence', () => {
  it('emits every delta first, then exactly one terminal chunk, with usage attached', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(eventArb, { maxLength: 12 }), async (events) => {
        const chunks = await run(events);
        const { code, consumed } = expectedTerminal(events);

        const terminals = chunks.filter((c) => c.type === 'done' || c.type === 'error');
        expect(terminals).toHaveLength(1);
        expect(chunks.at(-1)).toBe(terminals[0]);
        expect(chunks.every((c) => c.requestId === 'r1')).toBe(true);

        const deltaText = chunks
          .filter((c): c is Extract<TranslationChunk, { type: 'delta' }> => c.type === 'delta')
          .map((c) => c.text)
          .join('');
        const fedText = consumed.map((e) => (e.type === 'text' ? e.text : '')).join('');
        expect(deltaText).toBe(fedText);

        const terminal = terminals[0];
        if (terminal?.type === 'error') {
          expect(code).not.toBe('done');
          expect(terminal.code).toBe(code === 'text' ? 'SERVER' : code);
          const err = consumed.find((e) => e.type === 'error');
          if (err?.type === 'error') expect(terminal.message).toBe(err.message);
          else if (code === 'REQUEST') expect(terminal.message).toContain('max-tokens');
          return;
        }
        expect(code === 'done' || code === 'text').toBe(true);
        const merged: TokenUsage = {};
        for (const e of consumed) if (e.type === 'usage') Object.assign(merged, e.usage);
        const nonEmpty = Object.values(merged).some((v) => v !== undefined);
        if (terminal?.type === 'done') {
          expect(terminal.usage).toEqual(nonEmpty ? merged : undefined);
        }
      }),
      { numRuns: 400, examples: [DONE_EXAMPLE] },
    );
  });

  it('a translator that throws still ends in exactly one terminal chunk', async () => {
    async function* boom(): AsyncGenerator<StreamEvent> {
      yield { type: 'text', text: 'partial' };
      throw new TypeError('socket hang up');
    }
    const chunks: TranslationChunk[] = [];
    await runStream(boom(), { requestId: 'r1', label: 'Test', onChunk: (c) => chunks.push(c) });
    expect(chunks.map((c) => c.type)).toEqual(['delta', 'error']);
    const err = chunks[1];
    if (err?.type === 'error') expect(err.code).toBe('NETWORK');
  });

  it('a stream cut by the user is ABORTED, not a truncation', async () => {
    const ctrl = new AbortController();
    async function* cut(): AsyncGenerator<StreamEvent> {
      yield { type: 'text', text: 'partial' };
      ctrl.abort();
    }
    const chunks: TranslationChunk[] = [];
    await runStream(cut(), {
      requestId: 'r1',
      label: 'Test',
      signal: ctrl.signal,
      onChunk: (c) => chunks.push(c),
    });
    const err = chunks.at(-1);
    if (err?.type === 'error') expect(err.code).toBe('ABORTED');
    else throw new Error('expected an error terminal');
  });
});
