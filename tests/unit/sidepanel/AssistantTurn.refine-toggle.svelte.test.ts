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

  it('Escape on the pressed Refine button closes the row and does not reach the panel', async () => {
    const { container, getByRole } = latest();
    await openRefine(container);
    const btn = getByRole('button', { name: 'Refine this reply' });
    btn.focus();
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    btn.dispatchEvent(esc);
    await tick();
    expect(chips(container)).toBeNull();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    // The panel cancels a running reply on an Escape nobody handled.
    expect(esc.defaultPrevented).toBe(true);
  });

  it('keeps a typed request when the row closes, until it is sent', async () => {
    const onRefine = vi.fn().mockResolvedValue(true);
    const { container, getByRole } = latest({ onRefine });
    const btn = getByRole('button', { name: 'Refine this reply' });
    const field = (): HTMLInputElement | null =>
      container.querySelector<HTMLInputElement>('[data-ega-refine-text]');
    await openRefine(container);
    const custom = container.querySelector<HTMLElement>('[data-ega-refine-chip="custom"]');
    if (!custom) throw new Error('Write your own chip missing');
    expect(custom.textContent.trim()).toBe('Write your own…');
    await fireEvent.click(custom);
    await tick();
    const input = field();
    if (!input) throw new Error('field missing');
    await fireEvent.input(input, { target: { value: 'more poetic' } });
    await fireEvent.click(btn);
    await tick();
    expect(chips(container)).toBeNull();
    await openRefine(container);
    expect(field()?.value).toBe('more poetic');
    const apply = container.querySelector<HTMLElement>('[data-ega-refine-apply]');
    if (!apply) throw new Error('Apply missing');
    await fireEvent.click(apply);
    await waitFor(() => expect(chips(container)).toBeNull());
    expect(onRefine).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: 'a1', refinementBody: 'more poetic' }),
    );
    // Sent, so the next open starts with the field closed and empty.
    await openRefine(container);
    expect(field()).toBeNull();
  });

  it('a re-run keeps focus on the reply card instead of dropping it to the page', async () => {
    const { container, rerender } = latest();
    const regen = container.querySelector<HTMLElement>('[data-ega-regenerate]');
    if (!regen) throw new Error('Regenerate missing');
    regen.focus();
    // The action row unmounts while the new answer is pending, taking the focused button with it.
    await rerender({ turn: turn({ status: 'pending', content: '' }) });
    await tick();
    expect(container.querySelector('[data-ega-regenerate]')).toBeNull();
    const card = container.querySelector('article');
    expect(document.activeElement).toBe(card);
    expect(card?.getAttribute('aria-label')).toBe('Ega reply');
  });

  it('takes focus only on the step into answering, not when it mounts mid-answer or starts streaming', async () => {
    const { container, rerender } = latest({ turn: turn({ status: 'pending', content: '' }) });
    await tick();
    const card = container.querySelector('article');
    expect(document.activeElement).not.toBe(card);
    await rerender({ turn: turn({ status: 'streaming', content: 'he' }) });
    await tick();
    expect(document.activeElement).not.toBe(card);
  });

  it('a retried failure mounts as a new pending card and takes the focus its Retry button dropped', async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    const { container } = latest({ turn: turn({ status: 'pending', content: '', retries: 1 }) });
    await tick();
    expect(document.activeElement).toBe(container.querySelector('article'));
  });

  it('a retried card mounting while focus is elsewhere leaves it there', async () => {
    const outside = document.createElement('textarea');
    document.body.append(outside);
    outside.focus();
    latest({ turn: turn({ status: 'pending', content: '', retries: 1 }) });
    await tick();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('a re-run leaves focus alone when it is somewhere else', async () => {
    const { rerender } = latest();
    const outside = document.createElement('textarea');
    document.body.append(outside);
    outside.focus();
    await rerender({ turn: turn({ status: 'pending', content: '' }) });
    await tick();
    expect(document.activeElement).toBe(outside);
    outside.remove();
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

  it('keeps the Write your own chip working', async () => {
    const { container } = latest();
    await openRefine(container);
    const freeform = container.querySelector<HTMLElement>('[data-ega-refine-chip="custom"]');
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
