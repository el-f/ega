// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
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
    ['an Undo toast', { variant: 'success', action: { label: 'Undo', onClick: () => {} } }],
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
});
