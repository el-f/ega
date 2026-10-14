// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { showToast, dismissToast, closeStickyToast } from '@/content/toast';

function toastPart(selector = ''): HTMLElement | null {
  return (
    document
      .getElementById('ega-shadow-host')
      ?.shadowRoot?.querySelector<HTMLElement>(`.ega-toast${selector}`) ?? null
  );
}

let row: HTMLButtonElement;

beforeEach(() => {
  // The page control the user was on when the toast appeared.
  row = document.createElement('button');
  row.textContent = 'Translate';
  document.body.appendChild(row);
  row.focus();
});
afterEach(() => {
  dismissToast();
  row.remove();
  vi.useRealTimers();
});

describe('in-page toast and keyboard focus', () => {
  it.each<[string, () => void]>([
    [
      'Esc',
      () =>
        toastPart(' [data-ega-toast-close]')?.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
        ),
    ],
    ['its X', () => toastPart(' [data-ega-toast-close]')?.click()],
    ['its action', () => toastPart(' [data-ega-toast-action]')?.click()],
    ['a newer toast', () => showToast('Select some text first, then press the shortcut.')],
    ['a new Ega action', () => closeStickyToast()],
  ])('gives focus back to the page control when %s closes the toast', (_how, close) => {
    showToast('Ega was updated. Reload the page.', {
      kind: 'warning',
      action: { label: 'Reload page', run: () => {} },
    });
    toastPart(' [data-ega-toast-close]')?.focus();
    close();
    expect(document.activeElement).toBe(row);
  });

  it('gives focus back when the toast expires after the window lost focus', async () => {
    vi.useFakeTimers();
    showToast('Translated in place.', { action: { label: 'Undo', run: () => {} } });
    const close = toastPart(' [data-ega-toast-close]') as HTMLElement;
    close.focus();
    // What Chrome sends when the user switches windows: focus leaves, the toast keeps it.
    close.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
    await vi.advanceTimersByTimeAsync(8100);
    expect(toastPart()).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it('still gives focus back after the window lost focus and got it back', () => {
    showToast('Ega was updated. Reload the page.', {
      kind: 'warning',
      action: { label: 'Reload page', run: () => {} },
    });
    const close = toastPart(' [data-ega-toast-close]') as HTMLElement;
    close.focus();
    // A window switch and back: focus leaves and returns to the same button, both times with no relatedTarget.
    close.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
    close.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
    close.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    expect(toastPart()).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it('forgets the control once the user left the toast for the page body', async () => {
    showToast('Ega was updated. Reload the page.', {
      kind: 'warning',
      action: { label: 'Reload page', run: () => {} },
    });
    const close = toastPart(' [data-ega-toast-close]') as HTMLElement;
    close.focus();
    // The user clicks the page background, then the toast's X.
    close.blur();
    await Promise.resolve();
    expect(document.activeElement).toBe(document.body);
    close.focus();
    close.click();
    expect(toastPart()).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('leaves focus where the user moved it', () => {
    const field = document.createElement('input');
    document.body.appendChild(field);
    showToast('Select some text first, then press the shortcut.');
    toastPart(' [data-ega-toast-close]')?.focus();
    field.focus();
    closeStickyToast();
    expect(document.activeElement).toBe(field);
    field.remove();
  });

  it('does not move focus to a control that is gone', () => {
    showToast('Select some text first, then press the shortcut.');
    toastPart(' [data-ega-toast-close]')?.focus();
    row.remove();
    closeStickyToast();
    expect(document.activeElement).toBe(document.body);
  });
});
