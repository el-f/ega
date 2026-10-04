// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { AssistantTurnData } from '@/sidepanel/state/conversation';
import { formatDetectedLabel } from '@/shared/detected-label';

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

describe('AssistantTurn — multi-variety language pill cluster', () => {
  it('renders a cluster with one pill per variety when detectedLangs.length >= 2', () => {
    const detectedLangs = [{ id: 'arabizi', detail: 'Levantine' }, { id: 'en' }];
    const turn = baseTurn({ detectedLangs });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });

    const cluster = container.querySelector('[data-ega-multi-variety]');
    expect(cluster).not.toBeNull();
    if (!cluster) throw new Error('cluster missing');

    const pills = Array.from(cluster.querySelectorAll('.ega-lang-pill'));
    expect(pills.length).toBe(2);

    const label0 = formatDetectedLabel('arabizi', 'Levantine');
    const label1 = formatDetectedLabel('en', undefined);
    expect(pills[0]?.textContent.trim()).toBe(label0);
    expect(pills[1]?.textContent.trim()).toBe(label1);
  });

  it('does NOT render a cluster when detectedLangs is absent — falls back to single pill', () => {
    const turn = baseTurn({ detectedLang: 'arabizi' });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });

    expect(container.querySelector('[data-ega-multi-variety]')).toBeNull();

    const pills = Array.from(container.querySelectorAll('.ega-lang-pill'));
    expect(pills.length).toBe(1);
    expect(pills[0]?.textContent.trim()).toBe(formatDetectedLabel('arabizi', undefined));
  });

  it('does NOT render a cluster when detectedLangs has only 1 entry', () => {
    const turn = baseTurn({
      detectedLangs: [{ id: 'arabizi', detail: 'Levantine' }],
      detectedLang: 'arabizi',
      detectedDetail: 'Levantine',
    });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });

    expect(container.querySelector('[data-ega-multi-variety]')).toBeNull();
  });
});
