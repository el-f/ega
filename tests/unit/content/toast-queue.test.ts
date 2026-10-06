// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { showToast, dismissToast } from '@/content/toast';

function toastText(): string | null {
  const root = document.getElementById('ega-shadow-host')?.shadowRoot;
  return root?.querySelector('.ega-toast-text')?.textContent ?? null;
}

afterEach(() => {
  dismissToast();
});

describe('in-page toast queue', () => {
  it('shows one toast at a time: a new one replaces the current one', () => {
    showToast('Select some text first, then press the shortcut.');
    showToast('Ega does not read password, card or one-time-code fields.', { kind: 'warning' });
    expect(toastText()).toBe('Ega does not read password, card or one-time-code fields.');
    expect(
      document.getElementById('ega-shadow-host')?.shadowRoot?.querySelectorAll('.ega-toast'),
    ).toHaveLength(1);
  });

  it('drops a plain confirmation instead of covering a toast the user still has to read', () => {
    showToast('Select some text first, then press the shortcut.');
    showToast('Copied', { kind: 'success' });
    expect(toastText()).toBe('Select some text first, then press the shortcut.');
  });

  it('lets a plain confirmation replace another plain one', () => {
    showToast('Copied', { kind: 'success' });
    showToast('Saved', { kind: 'success' });
    expect(toastText()).toBe('Saved');
  });

  it('keeps an instruction or an action on screen until dismissed', async () => {
    vi.useFakeTimers();
    try {
      showToast('Select some text first, then press the shortcut.');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(toastText()).toBe('Select some text first, then press the shortcut.');
      showToast('Ega was updated.', { action: { label: 'Reload page', run: () => {} } });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(toastText()).toBe('Ega was updated.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('the Dismiss button removes the toast', () => {
    showToast('Nothing to translate in that element.');
    document
      .getElementById('ega-shadow-host')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-ega-toast-close]')
      ?.click();
    expect(toastText()).toBeNull();
  });
});
