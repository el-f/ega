import { describe, it, expect } from 'vitest';
import { runStream, type StreamEvent } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

async function errorFor(events: StreamEvent[]): Promise<string> {
  const chunks: TranslationChunk[] = [];
  await runStream(events, { requestId: 'r1', label: 'Test', onChunk: (c) => chunks.push(c) });
  const err = chunks.find((c) => c.type === 'error');
  if (err?.type !== 'error') throw new Error('no error chunk');
  expect(err.code).toBe('REQUEST');
  return err.message;
}

describe('a max-tokens stop', () => {
  it('with no visible text says the budget ran out before any answer (reasoning counts toward it)', async () => {
    const message = await errorFor([
      { type: 'text', text: '<think>long reasoning</think>' },
      { type: 'stop', reason: 'max_tokens' },
    ]);
    expect(message).toMatch(/before it wrote any answer/);
    expect(message).toMatch(/Settings → Translate/);
    expect(message).toMatch(/for this task in Settings → Tasks/);
  });

  it('after part of an answer says the answer was cut', async () => {
    const message = await errorFor([
      { type: 'text', text: '{"translation":"half an ans' },
      { type: 'stop', reason: 'max_tokens' },
    ]);
    expect(message).toMatch(/stopped early/);
  });
});
