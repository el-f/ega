// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
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

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await tick();
}

describe('toast lifetime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    render(ToastHost, { props: { position: 'bottom-right', theme: 'light' } });
  });
  afterEach(() => {
    // Unmount first: sonner 1.1.1 crashes ("reading 'toastId'") when 3+ toasts are dismissed together and
    // removed out of order. The next Toaster resets sonner's state on mount.
    cleanup();
    toastStore.dismiss();
    vi.useRealTimers();
  });

  it('a plain confirmation hides itself after 6 s', async () => {
    toastStore.push({ message: 'Saved answers cleared', variant: 'success' });
    await advance(5900);
    expect(toastEl('Saved answers cleared')).not.toBeNull();
    await advance(1000);
    expect(toastEl('Saved answers cleared')).toBeNull();
  });

  it.each([
    ['a Try again error', { variant: 'danger', action: { label: 'Try again', onClick: () => {} } }],
    ['an error', { variant: 'danger' }],
    ['a warning', { variant: 'warning' }],
    ['an instruction', { variant: 'info' }],
  ] as const)('%s stays until dismissed', async (_name, extra) => {
    toastStore.push({ message: 'Stays put', ...extra });
    await advance(30_000);
    expect(toastEl('Stays put')).not.toBeNull();
  });

  it('carries a close button inside the toast that dismisses it', async () => {
    toastStore.push({ message: 'Rule deleted', variant: 'danger' });
    await advance(100);
    const close = toastEl('Rule deleted')?.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss"]',
    );
    expect(close).toBeTruthy();
    close?.click();
    await advance(1000);
    expect(toastEl('Rule deleted')).toBeNull();
  });

  it('waits while focus is inside a toast, then gets a full 6 s after focus leaves', async () => {
    toastStore.push({ message: 'Copied as Markdown', variant: 'success' });
    await advance(100);
    const close = toastEl('Copied as Markdown')?.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss"]',
    );
    await fireEvent.focusIn(close as HTMLButtonElement);
    await advance(20_000);
    expect(toastEl('Copied as Markdown')).not.toBeNull();
    await fireEvent.focusOut(close as HTMLButtonElement, { relatedTarget: document.body });
    await advance(5900);
    expect(toastEl('Copied as Markdown')).not.toBeNull();
    await advance(1000);
    expect(toastEl('Copied as Markdown')).toBeNull();
  });

  it('waits while the pointer is over a toast', async () => {
    toastStore.push({ message: 'Language reset', variant: 'success' });
    await advance(100);
    const el = toastEl('Language reset') as HTMLElement;
    await fireEvent.pointerOver(el);
    await advance(20_000);
    expect(toastEl('Language reset')).not.toBeNull();
    await fireEvent.pointerOut(el, { relatedTarget: document.body });
    await advance(7000);
    expect(toastEl('Language reset')).toBeNull();
  });

  it('an Undo toast hides after 8 s, and its Undo can no longer be pressed', async () => {
    const onClick = vi.fn();
    toastStore.push({
      message: 'Rule deleted.',
      variant: 'success',
      action: { label: 'Undo', onClick },
    });
    await advance(7900);
    expect(toastEl('Rule deleted.')?.querySelector('[data-button]')?.textContent).toBe('Undo');
    await advance(1000);
    expect(toastEl('Rule deleted.')).toBeNull();
    expect(document.querySelector('[data-sonner-toast] [data-button]')).toBeNull();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('an Undo toast waits while the pointer is on it', async () => {
    toastStore.push({
      message: 'Message removed.',
      variant: 'info',
      action: { label: 'Undo', onClick: () => {} },
    });
    await advance(100);
    const el = toastEl('Message removed.') as HTMLElement;
    await fireEvent.pointerOver(el);
    await advance(30_000);
    expect(toastEl('Message removed.')).not.toBeNull();
    await fireEvent.pointerOut(el, { relatedTarget: document.body });
    await advance(9000);
    expect(toastEl('Message removed.')).toBeNull();
  });

  it('an offer that holds data only the toast has stays until it is used or dismissed', async () => {
    toastStore.push({
      message: 'Replace the attached image with the one from the page?',
      variant: 'info',
      action: { label: 'Replace', onClick: () => {} },
    });
    await advance(30_000);
    expect(toastEl('Replace the attached image')).not.toBeNull();
  });

  it('a countdown toast lives exactly as long as its countdown, pointer or not', async () => {
    toastStore.push({ message: 'Wait 7s before retrying.', variant: 'warning', countdownMs: 7000 });
    await advance(100);
    await fireEvent.pointerOver(toastEl('Wait 7s before retrying.') as HTMLElement);
    await advance(6800);
    expect(toastEl('Wait 7s before retrying.')).not.toBeNull();
    await advance(400);
    expect(toastEl('Wait 7s before retrying.')).toBeNull();
  });

  it('collapses identical toasts into one, but keeps each Undo', async () => {
    for (let i = 0; i < 3; i++)
      toastStore.push({ message: 'Clipboard is empty.', variant: 'warning' });
    toastStore.push({ message: 'Rule deleted.', action: { label: 'Undo', onClick: () => {} } });
    toastStore.push({ message: 'Rule deleted.', action: { label: 'Undo', onClick: () => {} } });
    await advance(100);
    const live = (text: string): number =>
      [...document.querySelectorAll<HTMLElement>('[data-sonner-toast]')].filter(
        (el) => el.dataset['removed'] !== 'true' && el.textContent.includes(text),
      ).length;
    expect(live('Clipboard is empty.')).toBe(1);
    expect(live('Rule deleted.')).toBe(2);
  });

  it('shows a dismissed message again when it is pushed again', async () => {
    toastStore.push({ message: 'Clipboard is empty.', variant: 'warning' });
    await advance(100);
    toastEl('Clipboard is empty.')
      ?.querySelector<HTMLButtonElement>('[data-close-button]')
      ?.click();
    await advance(1000);
    expect(toastEl('Clipboard is empty.')).toBeNull();
    toastStore.push({ message: 'Clipboard is empty.', variant: 'warning' });
    await advance(100);
    expect(toastEl('Clipboard is empty.')).not.toBeNull();
  });

  // Pins the markup Chromium's accessibility tree reads as assertive for a warning or an error (X14 role=alert).
  it('announces a warning or an error at once, a confirmation politely', async () => {
    for (const [message, variant, live] of [
      ['Could not save.', 'danger', 'assertive'],
      ['Check the key.', 'warning', 'assertive'],
      ['Saved.', 'success', 'polite'],
      ['Pick a language first.', 'info', 'polite'],
    ] as const) {
      toastStore.push({ message, variant });
      await advance(100);
      const toast = toastEl(message);
      const title = toast?.querySelector('[data-title]');
      expect(title?.textContent.trim()).toBe(message);
      // The nearest live region over the text is the toast itself, read whole.
      expect(title?.closest('[aria-live]')).toBe(toast);
      expect(toast?.getAttribute('aria-live')).toBe(live);
      expect(toast?.getAttribute('aria-atomic')).toBe('true');
    }
  });

  it('lets timers run again once the hovered toast is closed', async () => {
    toastStore.push({ message: 'Language reset', variant: 'success' });
    toastStore.push({ message: 'Check the key.', variant: 'warning' });
    await advance(100);
    const warning = toastEl('Check the key.') as HTMLElement;
    await fireEvent.pointerOver(warning);
    // The pointer never leaves: the toast it sat on is removed from under it.
    warning.querySelector<HTMLButtonElement>('[data-close-button]')?.click();
    await advance(1000);
    expect(toastEl('Check the key.')).toBeNull();
    await advance(6500);
    expect(toastEl('Language reset')).toBeNull();
  });

  // With the last toast, sonner removes its whole list, so no removed node is a toast itself.
  describe('the only toast goes away under a resting pointer', () => {
    async function nextUndoStillExpiresAt8s(): Promise<void> {
      toastStore.push({
        message: 'Right-click menu reset.',
        variant: 'success',
        action: { label: 'Undo', onClick: () => {} },
      });
      await advance(7900);
      expect(toastEl('Right-click menu reset.')).not.toBeNull();
      await advance(300);
      expect(toastEl('Right-click menu reset.')).toBeNull();
    }

    it('closed with its X', async () => {
      toastStore.push({ message: 'Check the key.', variant: 'warning' });
      await advance(100);
      const el = toastEl('Check the key.') as HTMLElement;
      await fireEvent.pointerOver(el);
      el.querySelector<HTMLButtonElement>('[data-close-button]')?.click();
      await advance(1000);
      expect(document.querySelector('[data-sonner-toast]')).toBeNull();
      await nextUndoStillExpiresAt8s();
    });

    it('closed by its Undo', async () => {
      toastStore.push({
        message: 'Rule deleted.',
        variant: 'success',
        action: { label: 'Undo', onClick: () => {} },
      });
      await advance(100);
      const el = toastEl('Rule deleted.') as HTMLElement;
      await fireEvent.pointerOver(el);
      el.querySelector<HTMLButtonElement>('[data-button]')?.click();
      await advance(1000);
      expect(document.querySelector('[data-sonner-toast]')).toBeNull();
      await nextUndoStillExpiresAt8s();
    });

    it('a countdown that ends', async () => {
      toastStore.push({
        message: 'Wait 3s before retrying.',
        variant: 'warning',
        countdownMs: 3000,
      });
      await advance(100);
      await fireEvent.pointerOver(toastEl('Wait 3s before retrying.') as HTMLElement);
      await advance(3500);
      expect(document.querySelector('[data-sonner-toast]')).toBeNull();
      await nextUndoStillExpiresAt8s();
    });
  });

  it('a repeated confirmation gets a fresh 6 s, not the rest of the first one', async () => {
    toastStore.push({ message: 'Copied as Markdown', variant: 'success' });
    await advance(4000);
    toastStore.push({ message: 'Copied as Markdown', variant: 'success' });
    await advance(2100);
    expect(toastEl('Copied as Markdown')).not.toBeNull();
    await advance(4000);
    expect(toastEl('Copied as Markdown')).toBeNull();
  });

  it('a repeated confirmation still waits under the pointer', async () => {
    toastStore.push({ message: 'Copied as Markdown', variant: 'success' });
    await advance(3000);
    toastStore.push({ message: 'Copied as Markdown', variant: 'success' });
    await advance(1000);
    const el = toastEl('Copied as Markdown') as HTMLElement;
    await fireEvent.pointerOver(el);
    // Past the first push's 6 s.
    await advance(3100);
    expect(toastEl('Copied as Markdown')).not.toBeNull();
    await fireEvent.pointerOut(el, { relatedTarget: document.body });
    await advance(6100);
    expect(toastEl('Copied as Markdown')).toBeNull();
  });

  it('a Try again that fails again at once shows the error again', async () => {
    const MSG = 'Could not clear the translation cache.';
    const fail = (): void => {
      toastStore.push({
        message: MSG,
        variant: 'danger',
        // The retry fails fast, inside sonner's exit animation of the clicked toast.
        action: { label: 'Try again', onClick: () => void setTimeout(fail, 20) },
      });
    };
    fail();
    await advance(100);
    toastEl(MSG)?.querySelector<HTMLButtonElement>('[data-button]')?.click();
    await advance(1000);
    expect(toastEl(MSG)).not.toBeNull();
  });

  it('close() takes the key a toast was pushed under, or its message', async () => {
    const undo = { label: 'Undo', onClick: () => {} };
    toastStore.push({ message: 'New conversation.', action: undo, key: 'new-conversation' });
    toastStore.push({ message: 'New conversation.', action: undo, key: 'new-conversation' });
    toastStore.push({ message: 'Wait for the current reply.', variant: 'warning' });
    toastStore.push({ message: 'Saved.', variant: 'success' });
    await advance(100);
    toastStore.close('new-conversation');
    toastStore.close('Wait for the current reply.');
    await advance(1000);
    expect(toastEl('New conversation.')).toBeNull();
    expect(toastEl('Wait for the current reply.')).toBeNull();
    expect(toastEl('Saved.')).not.toBeNull();
  });

  it('closeSticky closes every toast that waits for the user, one at a time, and keeps the timed ones', async () => {
    const errors: unknown[] = [];
    const onError = (e: unknown): void => void errors.push(e);
    process.on('uncaughtException', onError);
    try {
      // Four older sticky toasts behind two timed ones: closed in one go, sonner 1.1.1 throws here.
      toastStore.push({ message: 'Check the key.', variant: 'warning' });
      toastStore.push({ message: 'Could not save.', variant: 'danger' });
      toastStore.push({ message: 'Pick a language first.', variant: 'info' });
      toastStore.push({
        message: 'Could not reset.',
        variant: 'danger',
        action: { label: 'Try again', onClick: () => {} },
      });
      toastStore.push({
        message: 'Rule deleted.',
        variant: 'success',
        action: { label: 'Undo', onClick: () => {} },
      });
      toastStore.push({ message: 'Saved.', variant: 'success' });
      await advance(100);
      toastStore.closeSticky();
      await advance(1000);
      for (const sticky of [
        'Check the key.',
        'Could not save.',
        'Pick a language first.',
        'Could not reset.',
      ])
        expect(toastEl(sticky)).toBeNull();
      expect(toastEl('Saved.')).not.toBeNull();
      expect(toastEl('Rule deleted.')).not.toBeNull();
      await advance(8000);
      expect(errors).toEqual([]);
    } finally {
      process.off('uncaughtException', onError);
    }
  });

  it('a countdown re-pushed under one key stays one toast with the newest text and the first deadline', async () => {
    const live = (): HTMLElement[] =>
      [...document.querySelectorAll<HTMLElement>('[data-sonner-toast]')].filter(
        (el) => el.dataset['removed'] !== 'true',
      );
    // The panel builds each push from the same deadline: 30 s, then 27 s and 24 s left.
    for (const left of [30, 27, 24]) {
      toastStore.push({
        message: `Wait ${left}s before retrying.`,
        variant: 'warning',
        countdownMs: left * 1000,
        key: 'retry-wait',
      });
      if (left > 24) await advance(3000);
    }
    await advance(100);
    expect(live()).toHaveLength(1);
    expect(live()[0]?.textContent).toContain('Wait 24s before retrying.');
    await advance(23_800);
    expect(live()).toHaveLength(1);
    await advance(200);
    expect(live()).toHaveLength(0);
  });
});
