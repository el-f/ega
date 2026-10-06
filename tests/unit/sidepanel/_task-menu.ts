import { fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';

const trigger = (container: HTMLElement): HTMLElement => {
  const el = container.querySelector<HTMLElement>('[data-ega-task-switch]');
  if (!el) throw new Error('Try as trigger missing');
  return el;
};

/** Opens a reply's Try as menu from the keyboard; its items render in a portal on document.body. */
export async function openTaskMenu(container: HTMLElement): Promise<void> {
  await fireEvent.keyDown(trigger(container), { key: 'Enter' });
  await waitFor(() => {
    if (!document.querySelector('[data-ega-swap-item]')) throw new Error('menu not open');
  });
}

/** The swap item at the top of the open Try as menu. */
export function swapItem(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-ega-swap-item]');
  if (!el) throw new Error('swap item missing; open the menu first');
  return el;
}

/** Each item as [task id, whether it is disabled], in menu order. Open the menu first. */
export function taskMenuItems(): [string, boolean][] {
  return [...document.querySelectorAll('[data-ega-task-switch-item]')].map((el) => [
    el.getAttribute('data-ega-task-switch-item') ?? '',
    el.getAttribute('aria-disabled') === 'true',
  ]);
}

/** The task the menu shows checked; opens the menu and closes it again. */
export async function checkedTask(container: HTMLElement): Promise<string | null> {
  await openTaskMenu(container);
  const item = document.querySelector('[data-ega-task-switch-item][aria-checked="true"]');
  const id = item?.getAttribute('data-ega-task-switch-item') ?? null;
  await fireEvent.keyDown(swapItem(), { key: 'Escape' });
  await tick();
  return id;
}

/** Opens the menu and clicks the item for `id`; the menu closes after. */
export async function pickTask(container: HTMLElement, id: string): Promise<void> {
  await openTaskMenu(container);
  const item = document.querySelector<HTMLElement>(`[data-ega-task-switch-item="${id}"]`);
  if (!item) throw new Error(`task item ${id} missing`);
  await fireEvent.click(item);
  await tick();
}

/** Opens the reply's refine chips with its Refine button. */
export async function openRefine(container: HTMLElement): Promise<void> {
  const btn = container.querySelector<HTMLElement>('[data-ega-refine-toggle]');
  if (!btn) throw new Error('Refine button missing');
  await fireEvent.click(btn);
  await waitFor(() => {
    if (!container.querySelector('[data-ega-quick-refine]')) throw new Error('chips not open');
  });
}
