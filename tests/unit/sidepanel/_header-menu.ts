import { fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';

/** Opens the header's More menu from the keyboard; its items render in a portal on document.body. */
export async function openHeaderMenu(container: HTMLElement): Promise<void> {
  const trigger = container.querySelector<HTMLElement>('[data-ega-header-more]');
  if (!trigger) throw new Error('More menu trigger missing');
  await fireEvent.keyDown(trigger, { key: 'Enter' });
  await waitFor(() => {
    if (!document.querySelector('[data-ega-bookmark-filter]')) throw new Error('menu not open');
  });
}

/** Opens the More menu and picks the item that matches `selector`; the menu closes after. */
export async function pickHeaderMenuItem(
  container: HTMLElement,
  selector: string,
): Promise<HTMLElement> {
  await openHeaderMenu(container);
  const item = document.querySelector<HTMLElement>(selector);
  if (!item) throw new Error(`menu item ${selector} missing`);
  await fireEvent.click(item);
  await tick();
  return item;
}

/** Whether the bookmark filter is on, read from the menu item's own checked state. */
export async function bookmarkFilterOn(container: HTMLElement): Promise<boolean> {
  await openHeaderMenu(container);
  const on = document.querySelector('[data-ega-bookmark-filter]')?.getAttribute('aria-checked');
  await fireEvent.keyDown(document.querySelector('[data-ega-bookmark-filter]') as HTMLElement, {
    key: 'Escape',
  });
  await tick();
  return on === 'true';
}
