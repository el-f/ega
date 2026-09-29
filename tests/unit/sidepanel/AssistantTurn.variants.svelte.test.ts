// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { Turn } from '@/sidepanel/state/conversation';

const baseTurn = (overrides: Partial<Turn> = {}): Turn => ({
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

describe('AssistantTurn — variant nav pill', () => {
  it('omits the nav pill when variants.length === 1', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: baseTurn(), onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-variant-nav]')).toBeNull();
  });

  it('renders nav pill < n/N > when variants.length > 1', () => {
    const turn = baseTurn({
      variants: [
        { id: 'v1', status: 'done', content: 'first' },
        {
          id: 'v2',
          status: 'done',
          content: 'second',
          refinementBody: 'shorter',
        },
      ],
      activeVariantIdx: 1,
      content: 'second',
    });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    const nav = container.querySelector('[data-ega-variant-nav]');
    expect(nav).not.toBeNull();
    expect(nav?.textContent).toContain('2/2');
    expect(container.querySelector('[data-ega-variant-prev]')).not.toBeNull();
    expect(container.querySelector('[data-ega-variant-next]')).not.toBeNull();
  });

  it('clicking prev/next emits onSelectVariant with the new idx', async () => {
    const onSelectVariant = vi.fn();
    const turn = baseTurn({
      variants: [
        { id: 'v1', status: 'done', content: 'first' },
        { id: 'v2', status: 'done', content: 'second' },
      ],
      activeVariantIdx: 1,
      content: 'second',
    });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), onSelectVariant },
    });
    const prev = container.querySelector<HTMLButtonElement>('[data-ega-variant-prev]');
    if (!prev) throw new Error('prev btn missing');
    await fireEvent.click(prev);
    expect(onSelectVariant).toHaveBeenCalledWith('a1', 0);
  });

  it('prev disabled on first variant; next disabled on last variant', () => {
    const onSelectVariant = vi.fn();
    const turn = baseTurn({
      variants: [
        { id: 'v1', status: 'done', content: 'first' },
        { id: 'v2', status: 'done', content: 'second' },
      ],
      activeVariantIdx: 0,
      content: 'first',
    });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), onSelectVariant },
    });
    const prev = container.querySelector<HTMLButtonElement>('[data-ega-variant-prev]');
    const next = container.querySelector<HTMLButtonElement>('[data-ega-variant-next]');
    expect(prev?.disabled).toBe(true);
    expect(next?.disabled).toBe(false);
  });
});

describe('AssistantTurn — refinement chip', () => {
  it('omits refinement chip when active variant has no refinementBody', () => {
    const { container } = render(AssistantTurn, {
      props: { turn: baseTurn(), onRetry: vi.fn() },
    });
    expect(container.querySelector('[data-ega-refinement-chip]')).toBeNull();
  });

  it('renders refinement chip with body when active variant has refinementBody', () => {
    const turn = baseTurn({
      variants: [
        { id: 'v1', status: 'done', content: 'first' },
        {
          id: 'v2',
          status: 'done',
          content: 'second',
          refinementBody: 'use pig latin',
        },
      ],
      activeVariantIdx: 1,
      content: 'second',
    });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    const chip = container.querySelector('[data-ega-refinement-chip]');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain('use pig latin');
  });

  it('truncates refinement body at 60 chars with data-tooltip for the full body', () => {
    const longBody = 'a'.repeat(120);
    const turn = baseTurn({
      variants: [
        { id: 'v1', status: 'done', content: 'first' },
        {
          id: 'v2',
          status: 'done',
          content: 'second',
          refinementBody: longBody,
        },
      ],
      activeVariantIdx: 1,
      content: 'second',
    });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn() },
    });
    const chip = container.querySelector('[data-ega-refinement-chip]');
    expect(chip).not.toBeNull();
    expect(chip?.hasAttribute('title')).toBe(false);
    expect(chip?.getAttribute('data-tooltip')).toBe(longBody);
    // Visible label is truncated.
    const visible = chip?.textContent ?? '';
    expect(visible.length).toBeLessThanOrEqual(80); // includes "Refined: " prefix + ellipsis
    expect(visible).toContain('Refined:');
    expect(visible).toContain('…');
  });
});
