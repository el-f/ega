// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { tick } from 'svelte';
import { render } from '@testing-library/svelte';
import { AnthropicBackend } from '@/shared/backends/anthropic';
import { addAssistantTurn, applyChunk } from '@/sidepanel/state/conversation';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import { setFetchHandler } from '@tests/mocks/fetch';
import { noopCancel } from '@tests/_helpers/cancel';
import { sel } from '@tests/_helpers/lang';
import type { BackendConfig } from '@/shared/backends/base';
import type { TranslationChunk } from '@/shared/types';

// Anthropic can stop with stop_reason "refusal" after it already streamed some text.
const SSE = [
  'data: {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":1}}}',
  'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"translation\\":\\"Half an ans"}}',
  'data: {"type":"message_delta","delta":{"stop_reason":"refusal"},"usage":{"output_tokens":7}}',
  'data: {"type":"message_stop"}',
  '',
].join('\n\n');

describe('an Anthropic refusal after some text', () => {
  it('reaches the turn as an error and the partial text stays on screen above it', async () => {
    setFetchHandler(
      async () =>
        new Response(SSE, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const backendChunks: Array<{ type: string; text?: string; code?: string; message?: string }> =
      [];
    await new AnthropicBackend().translate({
      req: {
        id: 'r1',
        text: 'x',
        sourceLang: sel('auto'),
        targetLang: sel('en'),
        options: { stream: true, explain: false },
      },
      system: 'S',
      user: 'U',
      stream: true,
      cancel: noopCancel(),
      onChunk: (c) => backendChunks.push(c),
      config: {
        apiKeys: { anthropic: 'k' },
        model: { anthropic: 'claude-haiku-4-5-20251001' },
        advanced: { temperature: 0.2, maxTokens: 1000 },
      } as unknown as BackendConfig,
    });
    const err = backendChunks.find((c) => c.type === 'error');
    expect(err?.code).toBe('REQUEST');
    expect(backendChunks.some((c) => c.type === 'done')).toBe(false);

    // The same order of chunks through the side-panel reducer.
    let turns = addAssistantTurn([], { id: 'a1', kind: 'translate', attachedToTurnId: 'u1' });
    const toTurn: TranslationChunk[] = [
      { type: 'delta', requestId: 'r1', text: 'Half an ans' },
      { type: 'error', requestId: 'r1', code: 'REQUEST', message: err?.message ?? '' },
    ];
    for (const c of toTurn) turns = applyChunk(turns, 'a1', c);
    const turn = turns[0];
    if (!turn) throw new Error('no turn');
    expect(turn.status).toBe('error');
    expect(turn.content).toBe('Half an ans');

    const { container } = render(AssistantTurn, { props: { turn, onRetry: () => {} } });
    expect(container.textContent).toContain('Half an ans');
    // The shared catalog names the failure; the provider's own words sit behind Details.
    expect(container.querySelector('.ega-error-title')?.textContent).toContain('Request rejected');
    (container.querySelector('[data-ega-error-details]') as HTMLElement | null)?.click();
    await tick();
    expect(container.querySelector('.ega-error-detail')?.textContent).toContain(
      'refused to answer',
    );
  });
});
