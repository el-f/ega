// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { AssistantTurnData } from '@/sidepanel/state/conversation';
import type { ResultMeta } from '@/shared/types';
import type { BackendId } from '@/shared/brands';

const baseTurn = (overrides: Partial<AssistantTurnData> = {}): AssistantTurnData => ({
  id: 'a1',
  role: 'assistant',
  createdAt: 1,
  kind: 'translate',
  status: 'done',
  content: 'hello',
  variants: [
    {
      id: 'v1',
      status: 'done',
      content: 'hello',
    },
  ],
  activeVariantIdx: 0,
  ...overrides,
});

const testMeta: ResultMeta = {
  backendId: 'anthropic' as BackendId,
  cacheHit: false,
  latencyMs: 1234,
  modelId: 'claude-x',
};

describe('AssistantTurn — inspector drawer', () => {
  it('renders toggle button when turn has meta', () => {
    const turn = baseTurn({ meta: testMeta });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-inspector-toggle]')).not.toBeNull();
  });

  it('does not render toggle when turn has no meta', () => {
    const turn = baseTurn();
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-inspector-toggle]')).toBeNull();
  });

  it('clicking toggle shows the inspector drawer', async () => {
    const turn = baseTurn({ meta: testMeta });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });

    const toggle = container.querySelector<HTMLElement>('[data-ega-inspector-toggle]');
    if (!toggle) throw new Error('toggle missing');

    // drawer not visible before click
    expect(container.querySelector('[data-ega-inspector]')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    await fireEvent.click(toggle);

    // drawer visible after click
    expect(container.querySelector('[data-ega-inspector]')).not.toBeNull();
    expect(
      container.querySelector('[data-ega-inspector-toggle]')?.getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('drawer content contains backend id text', async () => {
    const turn = baseTurn({ meta: testMeta });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });

    const toggle = container.querySelector<HTMLElement>('[data-ega-inspector-toggle]');
    if (!toggle) throw new Error('toggle missing');
    await fireEvent.click(toggle);

    const drawer = container.querySelector('[data-ega-inspector]');
    expect(drawer?.textContent).toContain('Anthropic');
  });

  it('names the backend that answered in the actions row, without opening the drawer', () => {
    const turn = baseTurn({ meta: { ...testMeta, backendId: 'gemini' as BackendId } });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    const pill = container.querySelector('.ega-turn-actions .ega-backend-pill');
    expect(pill?.textContent.trim()).toBe('Gemini');
  });

  it('says Cached for an answer from the cache, which records no backend', () => {
    const turn = baseTurn({ meta: { ...testMeta, backendId: 'unknown', cacheHit: true } });
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });
    const pill = container.querySelector('.ega-backend-pill');
    expect(pill?.textContent.trim()).toBe('Cached');
    expect(pill?.getAttribute('data-tooltip')).toBe('Answered from the cache');
  });

  it('shows no backend pill when no backend is known and it was not a cache hit', () => {
    const turn = baseTurn({ meta: { ...testMeta, backendId: 'unknown', cacheHit: false } });
    const { container } = render(AssistantTurn, { props: { turn, onRetry: vi.fn() } });
    expect(container.querySelector('.ega-backend-pill')).toBeNull();
  });

  it('shows no backend pill when the turn has no meta', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: baseTurn(), onRetry: vi.fn() },
    });
    expect(container.querySelector('.ega-backend-pill')).toBeNull();
  });

  it('clicking toggle again hides the drawer', async () => {
    const turn = baseTurn({ meta: testMeta });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });

    const toggle = container.querySelector<HTMLElement>('[data-ega-inspector-toggle]');
    if (!toggle) throw new Error('toggle missing');

    await fireEvent.click(toggle);
    expect(container.querySelector('[data-ega-inspector]')).not.toBeNull();

    await fireEvent.click(toggle);
    expect(container.querySelector('[data-ega-inspector]')).toBeNull();
  });
});
