// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { chromeMock } from '@tests/mocks/chrome';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';
import { emitMaxTokensError } from '@/shared/backends/transportError';
import { TAB_LABELS } from '@/shared/settings-tabs';
import type { TranslationChunk } from '@/shared/types';

/** The real backend error, not a copy of its text. */
function maxTokensError(): { code: 'REQUEST'; message: string } {
  let out: TranslationChunk | null = null;
  emitMaxTokensError((c) => (out = c), 'r1');
  const chunk = out as TranslationChunk | null;
  if (chunk?.type !== 'error') throw new Error('expected an error chunk');
  if (chunk.code !== 'REQUEST') throw new Error(`expected REQUEST, got ${chunk.code}`);
  return { code: 'REQUEST', message: chunk.message };
}

function errorTurn(): Turn {
  return {
    createdAt: 1,
    id: 'a1',
    role: 'assistant',
    kind: 'translate',
    status: 'error',
    content: '',
    error: maxTokensError(),
  };
}

describe('the max-tokens error can be acted on from the side panel', () => {
  it('offers a route to settings, the way the tooltip already does', () => {
    const { container } = render(AssistantTurn, { props: { turn: errorTurn(), onRetry: vi.fn() } });
    expect(container.querySelector('[data-ega-sidepanel-open-options]')).not.toBeNull();
  });

  it('opens the tab that holds the setting the message names', async () => {
    chromeMock.storage.local._raw.clear();
    const { container } = render(AssistantTurn, { props: { turn: errorTurn(), onRetry: vi.fn() } });

    const btn = container.querySelector('[data-ega-sidepanel-open-options]');
    if (!btn) throw new Error('Open settings button missing');
    await fireEvent.click(btn);

    expect(chromeMock.storage.local._raw.get('ega.pendingOptionsTab')).toBe('translate');
    expect(maxTokensError().message).toContain(TAB_LABELS['translate']);
  });

  it('still sends a backend-config error to the Backends tab', async () => {
    chromeMock.storage.local._raw.clear();
    const turn: Turn = { ...errorTurn(), error: { code: 'AUTH', message: 'bad key' } };
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });

    const btn = container.querySelector('[data-ega-sidepanel-open-options]');
    if (!btn) throw new Error('Open settings button missing');
    await fireEvent.click(btn);

    expect(chromeMock.storage.local._raw.get('ega.pendingOptionsTab')).toBe('backends');
  });
});
