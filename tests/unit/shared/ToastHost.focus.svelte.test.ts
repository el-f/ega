// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import ToastHost from '@/shared/components/ToastHost.svelte';
import { toastStore } from '@/shared/components/toastStore';

function toastEl(text: string): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>('[data-sonner-toast]')].find(
      (el) => el.dataset['removed'] !== 'true' && el.textContent.includes(text),
    ) ?? null
  );
}

function closeButton(text: string): HTMLButtonElement {
  return toastEl(text)?.querySelector<HTMLButtonElement>(
    '[data-close-button]',
  ) as HTMLButtonElement;
}

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await tick();
}

let row: HTMLButtonElement;

describe('toasts and keyboard focus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    render(ToastHost, { props: { position: 'bottom-right', theme: 'light' } });
    // The control the user was on when the toast appeared.
    row = document.createElement('button');
    row.textContent = 'Delete rule';
    document.body.appendChild(row);
    row.focus();
  });
  afterEach(() => {
    cleanup();
    toastStore.dismiss();
    row.remove();
    vi.useRealTimers();
  });

  it('spreads the stack while focus is inside, so a back toast is never focused while hidden', async () => {
    toastStore.push({ message: 'Check the key.', variant: 'warning' });
    toastStore.push({ message: 'Saved.', variant: 'success' });
    await advance(100);
    expect(toastEl('Check the key.')?.dataset['expanded']).toBe('false');
    closeButton('Check the key.').focus();
    await tick();
    expect(toastEl('Check the key.')?.dataset['expanded']).toBe('true');
    expect(toastEl('Saved.')?.dataset['expanded']).toBe('true');
  });

  it.each([
    ['its X', (text: string) => closeButton(text).click()],
    [
      'its action',
      (text: string) => toastEl(text)?.querySelector<HTMLButtonElement>('[data-button]')?.click(),
    ],
    ['a new action', () => toastStore.closeSticky()],
  ])('gives focus back to where it came from when the toast goes by %s', async (_how, closeIt) => {
    toastStore.push({
      message: 'Could not reset.',
      variant: 'danger',
      action: { label: 'Try again', onClick: () => {} },
    });
    await advance(100);
    closeButton('Could not reset.').focus();
    closeIt('Could not reset.');
    await advance(1000);
    expect(toastEl('Could not reset.')).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it('gives focus back when a countdown ends with focus inside', async () => {
    toastStore.push({ message: 'Wait 3s before retrying.', variant: 'warning', countdownMs: 3000 });
    await advance(100);
    closeButton('Wait 3s before retrying.').focus();
    await advance(3500);
    expect(document.activeElement).toBe(row);
  });

  it('leaves focus alone when the user moved it elsewhere first', async () => {
    const other = document.createElement('input');
    document.body.appendChild(other);
    toastStore.push({ message: 'Check the key.', variant: 'warning' });
    await advance(100);
    closeButton('Check the key.').focus();
    other.focus();
    toastStore.closeSticky();
    await advance(1000);
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it('leaves focus on the page when the user clicked away from a toast that stayed', async () => {
    toastStore.push({ message: 'Check the key.', variant: 'warning' });
    await advance(100);
    const close = closeButton('Check the key.');
    close.focus();
    close.blur();
    await advance(100);
    toastStore.closeSticky();
    await advance(1000);
    expect(document.activeElement).toBe(document.body);
  });

  it('does not move focus to a control that is gone', async () => {
    toastStore.push({ message: 'Check the key.', variant: 'warning' });
    await advance(100);
    closeButton('Check the key.').focus();
    row.remove();
    toastStore.closeSticky();
    await advance(1000);
    expect(document.activeElement).toBe(document.body);
  });
});
