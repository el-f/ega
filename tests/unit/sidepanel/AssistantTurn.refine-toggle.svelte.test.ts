// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { AssistantTurnData } from '@/sidepanel/state/conversation';
import { asBackendIdUnsafe } from '@/shared/brands';
import { openRefine } from './_task-menu';

const turn = (overrides: Partial<AssistantTurnData> = {}): AssistantTurnData => ({
  id: 'a1',
  role: 'assistant',
  createdAt: 1,
  kind: 'translate',
  status: 'done',
  content: 'hello',
  meta: { backendId: asBackendIdUnsafe('anthropic'), latencyMs: 1, cacheHit: false },
  ...overrides,
});

const latest = (props: Record<string, unknown> = {}) =>
  render(AssistantTurn, {
    props: {
      turn: turn(),
      onRetry: vi.fn(),
      onRefine: vi.fn().mockResolvedValue(true),
      onSwap: vi.fn(),
      onTaskSwitch: vi.fn(),
      isLatest: true,
      ...props,
    },
  });

const chips = (c: HTMLElement): Element | null => c.querySelector('[data-ega-quick-refine]');

describe('AssistantTurn — the Refine button opens the refine chips', () => {
  it('hides the chips until the Refine button is pressed', async () => {
    const { container, getByRole } = latest();
    expect(chips(container)).toBeNull();
    const btn = getByRole('button', { name: 'Refine this reply' });
    expect(btn.closest('[role="toolbar"]')).not.toBeNull();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(btn);
    await tick();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(chips(container)?.id).toBe(btn.getAttribute('aria-controls'));
  });

  it('moves focus to the first chip on open', async () => {
    const { container } = latest();
    await openRefine(container);
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('data-ega-refine-chip')).toBe('shorter');
    });
  });

  it('Escape in the row closes it and gives focus back to the Refine button', async () => {
    const { container, getByRole } = latest();
    await openRefine(container);
    const chip = container.querySelector<HTMLElement>('[data-ega-refine-chip="less-formal"]');
    if (!chip) throw new Error('chip missing');
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    chip.dispatchEvent(esc);
    await tick();
    expect(chips(container)).toBeNull();
    expect(esc.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(getByRole('button', { name: 'Refine this reply' }));
  });

  it('closes after a chip refine dispatches', async () => {
    const onRefine = vi.fn().mockResolvedValue(true);
    const { container } = latest({ onRefine });
    await openRefine(container);
    const shorter = container.querySelector<HTMLElement>('[data-ega-refine-chip="shorter"]');
    if (!shorter) throw new Error('chip missing');
    await fireEvent.click(shorter);
    await waitFor(() => expect(chips(container)).toBeNull());
    expect(onRefine).toHaveBeenCalledWith(expect.objectContaining({ turnId: 'a1' }));
  });

  it('stays open when the refine bails', async () => {
    const onRefine = vi.fn().mockResolvedValue(false);
    const { container } = latest({ onRefine });
    await openRefine(container);
    const shorter = container.querySelector<HTMLElement>('[data-ega-refine-chip="shorter"]');
    if (!shorter) throw new Error('chip missing');
    await fireEvent.click(shorter);
    await waitFor(() => expect(onRefine).toHaveBeenCalled());
    await tick();
    expect(chips(container)).not.toBeNull();
  });

  it('closes when a newer reply arrives, and does not reopen on its own', async () => {
    const { container, rerender } = latest();
    await openRefine(container);
    await rerender({ isLatest: false });
    expect(chips(container)).toBeNull();
    expect(container.querySelector('[data-ega-refine-toggle]')).toBeNull();
    await rerender({ isLatest: true });
    expect(container.querySelector('[data-ega-refine-toggle]')?.getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(chips(container)).toBeNull();
  });

  it('keeps the free-text Refine chip working', async () => {
    const { container } = latest();
    await openRefine(container);
    const freeform = container.querySelector<HTMLElement>('[data-ega-refine-chip="refine"]');
    if (!freeform) throw new Error('free-text chip missing');
    await fireEvent.click(freeform);
    await tick();
    expect(container.querySelector('[data-ega-refine-text]')).not.toBeNull();
  });

  it('gives an image turn no Refine button', () => {
    const { container } = latest({ hasImage: true });
    expect(container.querySelector('[data-ega-refine-toggle]')).toBeNull();
  });
});

describe('AssistantTurn — the action row', () => {
  it('lists copy, regenerate, details, refine, try-as, more in DOM order, one tab stop', () => {
    const { container } = latest();
    const row = container.querySelector('[role="toolbar"]');
    const keys = [...(row?.querySelectorAll('[data-ega-action]') ?? [])].map((el) =>
      el.getAttribute('data-ega-action'),
    );
    expect(keys).toEqual(['copy', 'regenerate', 'details', 'refine', 'try-as', 'more']);
    const stops = [...(row?.querySelectorAll('[data-ega-action]') ?? [])].filter(
      (el) => el.getAttribute('tabindex') === '0',
    );
    expect(stops).toHaveLength(1);
  });

  it('arrows walk through refine and try-as to more', async () => {
    const { container } = latest();
    const row = container.querySelector<HTMLElement>('[role="toolbar"]');
    if (!row) throw new Error('toolbar missing');
    const at = (k: string): HTMLElement | null =>
      row.querySelector<HTMLElement>(`[data-ega-action='${k}']`);
    at('details')?.focus();
    for (const want of ['refine', 'try-as', 'more']) {
      await fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(at(want));
      expect(at(want)?.getAttribute('tabindex')).toBe('0');
    }
  });
});
