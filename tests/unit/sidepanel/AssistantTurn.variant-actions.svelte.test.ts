// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import type { AssistantTurnData } from '@/sidepanel/state/conversation';
import { openTaskMenu, pickTask, swapItem } from './_task-menu';

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

const latest = (props: Record<string, unknown> = {}) =>
  render(AssistantTurn, {
    props: {
      turn: baseTurn(),
      onRetry: vi.fn(),
      isLatest: true,
      onSwap: vi.fn(),
      onTaskSwitch: vi.fn(),
      ...props,
    },
  });

const focusedMenuItem = (): HTMLElement => {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || el.closest('[role="menu"]') === null) {
    throw new Error('no menu item focused');
  }
  return el;
};

describe('AssistantTurn — the Re-run as menu holds swap and the task re-runs', () => {
  it('is one icon button in the action row, with no separate swap row', () => {
    const { container, getByRole } = latest();
    const trigger = getByRole('button', { name: 'Re-run with another task or language' });
    expect(trigger.hasAttribute('data-ega-task-switch')).toBe(true);
    expect(trigger.closest('[role="toolbar"]')).not.toBeNull();
    // The swap lives in the menu now; nothing renders it in the card itself.
    expect(container.querySelector('[data-ega-swap]')).toBeNull();
    expect(container.querySelector('.ega-variant-actions')).toBeNull();
  });

  it('lists swap first, then a separator, then the tasks', async () => {
    const { container } = latest();
    await openTaskMenu(container);
    const kids = [...(document.querySelector('[role="menu"]')?.children ?? [])];
    expect(kids[0]?.hasAttribute('data-ega-swap-item')).toBe(true);
    expect(kids[0]?.hasAttribute('data-ega-swap')).toBe(true);
    expect(kids[1]?.getAttribute('role')).toBe('separator');
    expect(kids[2]?.querySelector('[data-ega-task-switch-item]')).not.toBeNull();
  });

  it('the swap item calls onSwap(turnId) and closes the menu', async () => {
    const onSwap = vi.fn();
    const { container } = latest({ onSwap });
    await openTaskMenu(container);
    await fireEvent.click(swapItem());
    expect(onSwap).toHaveBeenCalledWith('a1');
    await waitFor(() => {
      if (document.querySelector('[data-ega-swap-item]')) throw new Error('still open');
    });
  });

  it('names the pair the swap will run with', async () => {
    const { container } = latest({ swapPair: { sourceLang: 'en', targetLang: 'es' } });
    await openTaskMenu(container);
    expect(swapItem().textContent.trim()).toBe('Swap languages (English → Spanish)');
    expect(swapItem().getAttribute('aria-disabled')).toBe('false');
  });

  it('a blocked swap stays reachable by arrow keys, shows why as text, and does nothing', async () => {
    const onSwap = vi.fn();
    const { container } = latest({ onSwap, swapDisabled: true });
    await openTaskMenu(container);
    // A keyboard open lands on the checked task; one ArrowUp reaches the swap, which bits' own disabled would skip.
    await waitFor(focusedMenuItem);
    await fireEvent.keyDown(focusedMenuItem(), { key: 'ArrowUp' });
    expect(focusedMenuItem()).toBe(swapItem());
    expect(swapItem().getAttribute('aria-disabled')).toBe('true');
    expect(swapItem().hasAttribute('data-disabled')).toBe(false);
    expect(swapItem().querySelector('[data-ega-swap-note]')?.textContent).toBe(
      'No source language to swap from yet',
    );
    await fireEvent.click(swapItem());
    await tick();
    expect(onSwap).not.toHaveBeenCalled();
    // A blocked pick keeps the menu open, so the reason stays on screen.
    expect(document.querySelector('[data-ega-swap-item]')).not.toBeNull();
  });

  it('a swap a reply already ran says so and sends nothing', async () => {
    const onSwap = vi.fn();
    const { container } = latest({
      onSwap,
      swapPair: { sourceLang: 'en', targetLang: 'es', blocked: 'answered' },
    });
    await openTaskMenu(container);
    expect(swapItem().getAttribute('aria-disabled')).toBe('true');
    expect(swapItem().querySelector('[data-ega-swap-note]')?.textContent).toBe(
      'Already answered this way',
    );
    await fireEvent.click(swapItem());
    await tick();
    expect(onSwap).not.toHaveBeenCalled();
  });

  it('a pair of one language says why instead of offering "Hebrew → Hebrew"', async () => {
    const onSwap = vi.fn();
    const { container } = latest({
      onSwap,
      swapPair: { sourceLang: 'he', targetLang: 'he', blocked: 'same-language' },
    });
    await openTaskMenu(container);
    expect(swapItem().getAttribute('aria-disabled')).toBe('true');
    expect(swapItem().textContent).not.toContain('Hebrew');
    expect(swapItem().querySelector('[data-ega-swap-note]')?.textContent).toBe(
      'Source and target are the same language',
    );
    await fireEvent.click(swapItem());
    await tick();
    expect(onSwap).not.toHaveBeenCalled();
  });

  it('an image turn says why it has no swap', async () => {
    const { container } = latest({ hasImage: true });
    await openTaskMenu(container);
    expect(swapItem().getAttribute('aria-disabled')).toBe('true');
    expect(swapItem().textContent).toContain('Images have no source language to swap');
  });

  it('picking a task calls onTaskSwitch(turnId, task)', async () => {
    const onTaskSwitch = vi.fn();
    const { container } = latest({ onTaskSwitch });
    await pickTask(container, 'explain');
    expect(onTaskSwitch).toHaveBeenCalledTimes(1);
    expect(onTaskSwitch).toHaveBeenCalledWith('a1', 'explain');
  });

  it('arrow keys only move the highlight; Enter on the highlighted task re-runs once', async () => {
    const onTaskSwitch = vi.fn();
    const onSwap = vi.fn();
    const { container } = latest({ onTaskSwitch, onSwap });
    await openTaskMenu(container);
    await waitFor(focusedMenuItem);
    await fireEvent.keyDown(focusedMenuItem(), { key: 'ArrowDown' });
    await fireEvent.keyDown(focusedMenuItem(), { key: 'ArrowDown' });
    await tick();
    expect(onTaskSwitch).not.toHaveBeenCalled();
    expect(onSwap).not.toHaveBeenCalled();
    const highlighted = focusedMenuItem();
    const id = highlighted.getAttribute('data-ega-task-switch-item');
    expect(id).not.toBeNull();
    expect(id).not.toBe('translate');
    await fireEvent.keyDown(highlighted, { key: 'Enter' });
    await tick();
    expect(onTaskSwitch).toHaveBeenCalledTimes(1);
    expect(onTaskSwitch).toHaveBeenCalledWith('a1', id);
  });

  // Swap sits first, so landing on the first item made Enter, Enter a paid re-run; the More menu keeps Delete last for the same reason.
  it('a keyboard open focuses the checked task, so Enter then Enter re-runs nothing', async () => {
    const onTaskSwitch = vi.fn();
    const onSwap = vi.fn();
    const { container } = latest({
      onTaskSwitch,
      onSwap,
      swapPair: { sourceLang: 'en', targetLang: 'es' },
    });
    await openTaskMenu(container);
    await waitFor(() => {
      expect(focusedMenuItem().getAttribute('data-ega-task-switch-item')).toBe('translate');
    });
    expect(focusedMenuItem().getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('[role="menu"]')?.firstElementChild).toBe(swapItem());
    await fireEvent.keyDown(focusedMenuItem(), { key: 'Enter' });
    await tick();
    expect(onSwap).not.toHaveBeenCalled();
    expect(onTaskSwitch).not.toHaveBeenCalled();
  });

  it('picking the task that already answered re-runs nothing', async () => {
    const onTaskSwitch = vi.fn();
    const { container } = latest({ onTaskSwitch });
    await pickTask(container, 'translate');
    expect(onTaskSwitch).not.toHaveBeenCalled();
  });

  it('a busy Re-run as stays focusable, names its reason, and opens no menu', async () => {
    const { container } = latest({ inflight: true });
    const trigger = container.querySelector<HTMLButtonElement>('[data-ega-task-switch]');
    if (!trigger) throw new Error('trigger missing');
    expect(trigger.disabled).toBe(false);
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    expect(trigger.getAttribute('aria-label')).toBe(
      'Re-run with another task or language — wait for this reply to finish',
    );
    trigger.focus();
    await waitFor(() => {
      expect(document.querySelector('.ega-icon-btn-tooltip')?.textContent.trim()).toBe(
        'Wait for this reply to finish',
      );
    });
    // One gesture at a time: a key then a click would toggle twice and close an open menu.
    const menuOpens = (): Promise<void> =>
      waitFor(
        () => {
          if (!document.querySelector('[data-ega-swap-item]')) throw new Error('closed');
        },
        { timeout: 300 },
      );
    await fireEvent.keyDown(trigger, { key: 'Enter' });
    await expect(menuOpens()).rejects.toThrow();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(trigger);
    await expect(menuOpens()).rejects.toThrow();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('is absent on an older reply', () => {
    const { container } = latest({ isLatest: false });
    expect(container.querySelector('[data-ega-task-switch]')).toBeNull();
  });

  it('is absent while the reply is still streaming', () => {
    const { container } = latest({ turn: baseTurn({ status: 'streaming', variants: [] }) });
    expect(container.querySelector('[data-ega-task-switch]')).toBeNull();
  });

  // Gated on latest+done+onSwap, NOT on task=translate, so the copy must stay task-neutral.
  it('keeps the copy task-neutral on a non-translate turn', async () => {
    const { container, getByRole } = latest({ turn: baseTurn({ kind: 'explain' }) });
    expect(getByRole('button', { name: 'Re-run with another task or language' })).toBeTruthy();
    await openTaskMenu(container);
    expect(swapItem().textContent.trim()).toBe('Swap languages');
  });
});
