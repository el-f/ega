// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { showToast, dismissToast, closeStickyToast } from '@/content/toast';

function toastEl(): Element | null {
  return (
    document.getElementById('ega-shadow-host')?.shadowRoot?.querySelector('.ega-toast') ?? null
  );
}

function toastText(): string | null {
  return toastEl()?.querySelector('.ega-toast-text')?.textContent ?? null;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  dismissToast();
  vi.useRealTimers();
});

describe('in-page toast lifetimes (X14)', () => {
  it('an Undo toast hides after 8 s, so a late Undo cannot overwrite newer edits', async () => {
    const run = vi.fn();
    showToast('Translated in place.', { action: { label: 'Undo', run } });
    await vi.advanceTimersByTimeAsync(7900);
    expect(toastText()).toBe('Translated in place.');
    await vi.advanceTimersByTimeAsync(200);
    expect(toastEl()).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('a button that stays valid keeps its toast until dismissed', async () => {
    showToast('Ega was updated.', {
      kind: 'warning',
      action: { label: 'Reload page', run: () => {} },
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(toastText()).toBe('Ega was updated.');
  });

  it('the same notice again stays the same toast', () => {
    showToast('Select some text first, then press the shortcut.');
    const first = toastEl();
    showToast('Select some text first, then press the shortcut.');
    expect(toastEl()).toBe(first);
  });

  it('a new Ega action closes a notice that waits for the user', () => {
    showToast('Select some text first, then press the shortcut.');
    closeStickyToast();
    expect(toastEl()).toBeNull();
  });

  it('a new Ega action leaves a timed toast alone', () => {
    showToast('Translated in place.', { action: { label: 'Undo', run: () => {} } });
    closeStickyToast();
    expect(toastText()).toBe('Translated in place.');
    dismissToast();
    showToast('Copied', { kind: 'success' });
    closeStickyToast();
    expect(toastText()).toBe('Copied');
  });
});
