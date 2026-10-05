// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

function shadowQuery(selector: string): Element | null {
  const host = document.getElementById('ega-shadow-host') as HTMLElement | null;
  const root = host?.shadowRoot;
  return root?.querySelector(selector) ?? null;
}

/** Past the guard that keeps a double-click on Stop from also pressing Show original. */
function pastToggleGuard(): void {
  vi.setSystemTime(Date.now() + 500);
}

function shadowActive(): Element | null {
  return document.getElementById('ega-shadow-host')?.shadowRoot?.activeElement ?? null;
}

/** The declarations of one rule in the pill sheet. */
function cssRule(selector: string): string {
  const sheet = readFileSync(resolve('src/content/batch-progress.css'), 'utf8');
  const start = sheet.indexOf(`${selector} {`);
  return start === -1 ? '' : sheet.slice(start, sheet.indexOf('}', start));
}

function shadowQueryAll(selector: string): Element[] {
  const host = document.getElementById('ega-shadow-host') as HTMLElement | null;
  const root = host?.shadowRoot;
  return root ? Array.from(root.querySelectorAll(selector)) : [];
}

describe('batch-progress lifecycle', () => {
  // The first import transforms the whole shadow host; on a loaded box that alone outlasts a test's 5 s.
  beforeAll(async () => {
    await import('@/content/batch-progress');
  }, 60_000);

  beforeEach(() => {
    document.body.innerHTML = '';
    // The host lives on documentElement, so clearing body keeps it; dismiss() clears `active`, so the next toast mounts clean.
  });

  afterEach(async () => {
    vi.useRealTimers();
    const mod = await import('@/content/batch-progress');
    if (mod.isBatchProgressActive()) {
      const h = mod.showBatchProgress(1, () => {});
      h.dismiss();
    }
  });

  it('mounts a single toast and reports active=true', async () => {
    const { showBatchProgress, isBatchProgressActive } = await import('@/content/batch-progress');
    expect(isBatchProgressActive()).toBe(false);
    const h = showBatchProgress(10, () => {});
    expect(isBatchProgressActive()).toBe(true);
    expect(shadowQuery('[data-ega-batch-progress]')).toBeTruthy();
    h.dismiss();
    expect(isBatchProgressActive()).toBe(false);
  });

  it('updates the count label in place without remounting', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const h = showBatchProgress(7, () => {});
    const before = shadowQuery('[data-ega-batch-progress]');
    h.update(3);
    const after = shadowQuery('[data-ega-batch-progress]');
    // Same DOM node — no remount.
    expect(before).toBe(after);
    const label = shadowQuery('[data-ega-batch-progress] .label');
    expect(label?.textContent).toMatch(/3.*7/);
    h.dismiss();
  });

  it('replaces a prior progress toast on re-show (single-instance)', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const cancel1 = vi.fn();
    const cancel2 = vi.fn();
    showBatchProgress(5, cancel1);
    const before = shadowQueryAll('[data-ega-batch-progress-wrap]').length;
    const h2 = showBatchProgress(12, cancel2);
    const after = shadowQueryAll('[data-ega-batch-progress-wrap]').length;
    expect(before).toBe(1);
    expect(after).toBe(1);
    h2.dismiss();
  });

  it('Cancel button wires through to the supplied callback', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const onCancel = vi.fn();
    const h = showBatchProgress(5, onCancel);
    const btn = shadowQuery('[data-ega-batch-cancel]') as HTMLButtonElement | null;
    expect(btn).toBeTruthy();
    btn?.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    h.dismiss();
  });

  it('after settle the button toggles Show original ⇄ Show translation', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const onCancel = vi.fn();
    const seen: boolean[] = [];
    const h = showBatchProgress(3, onCancel);
    h.settle({ done: 3, total: 3, complete: true, failed: 0 });
    h.setOnToggleOriginal((s) => seen.push(s));
    const btn = shadowQuery('[data-ega-batch-cancel]') as HTMLButtonElement;
    expect(btn.textContent).toBe('Show original');

    btn.click();
    expect(seen).toEqual([true]);
    expect(btn.textContent).toBe('Show translation');
    expect(btn.getAttribute('aria-label')).toBe('Show translation on the page');

    btn.click();
    expect(seen).toEqual([true, false]);
    expect(btn.textContent).toBe('Show original');
    expect(onCancel).not.toHaveBeenCalled();
    h.dismiss();
  });

  it('a settled click with no toggle handler falls back to the cancel callback', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const onCancel = vi.fn();
    const h = showBatchProgress(3, onCancel);
    h.settle({ done: 3, total: 3, complete: true, failed: 0 });
    const btn = shadowQuery('[data-ega-batch-cancel]') as HTMLButtonElement;
    btn.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    h.dismiss();
  });

  it('the live region names areas, which is what the user picked', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const h = showBatchProgress(12, () => {});
    const live = shadowQuery('[data-ega-batch-live]');
    expect(live?.textContent).toMatch(/Translating 12 areas/);
    h.dismiss();
  });

  it('singular framing when total === 1', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const h = showBatchProgress(1, () => {});
    const live = shadowQuery('[data-ega-batch-live]');
    expect(live?.textContent).toMatch(/Translating 1 area(?!s)/);
    h.dismiss();
  });

  it('a partial settle never claims every block was translated', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const h = showBatchProgress(5, () => {});
    h.settle({ done: 5, total: 5, complete: false, failed: 2 });
    const label = shadowQuery('[data-ega-batch-label]');
    expect(label?.textContent).toBe('2 of 5 areas failed');
    h.dismiss();
  });

  it('names the shared reason when every failure has the same one', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const h = showBatchProgress(5, () => {});
    h.settle({ done: 5, total: 5, complete: false, failed: 5, failedLabel: 'Setup needed' });
    expect(shadowQuery('[data-ega-batch-label]')?.textContent).toBe(
      'All 5 areas failed: Setup needed',
    );
    h.dismiss();
  });

  it('a clean settle still reads as done', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const h = showBatchProgress(5, () => {});
    h.settle({ done: 5, total: 5, complete: true, failed: 0 });
    expect(shadowQuery('[data-ega-batch-label]')?.textContent).toBe('Page translated');
    h.dismiss();
  });

  it('a retry after settle puts the pill back to in-progress', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const onCancel = vi.fn();
    const h = showBatchProgress(4, onCancel);
    h.settle({ done: 4, total: 4, complete: false, failed: 1 });
    h.setOnToggleOriginal(() => {});

    h.update(3);
    expect(shadowQuery('[data-ega-batch-label]')?.textContent).toBe('Translating 3 of 4 areas…');
    const btn = shadowQuery('[data-ega-batch-cancel]') as HTMLButtonElement;
    expect(btn.textContent.trim()).toBe('Stop');

    // Re-settling after the retry finishes puts the toggle back.
    h.settle({ done: 4, total: 4, complete: true, failed: 0 });
    expect(shadowQuery('[data-ega-batch-label]')?.textContent).toBe('Page translated');
    expect(btn.textContent).toBe('Show original');
    h.dismiss();
  });

  it('shows Retry failed only when a settled batch has failures, and wires it', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const onRetry = vi.fn();
    const h = showBatchProgress(4, () => {});
    h.setOnRetryFailed(onRetry);
    const btn = shadowQuery('.retry-failed') as HTMLButtonElement;
    expect(btn.hidden).toBe(true);

    h.settle({ done: 4, total: 4, complete: false, failed: 1 });
    expect(btn.hidden).toBe(false);
    btn.click();
    expect(onRetry).toHaveBeenCalledTimes(1);

    h.settle({ done: 4, total: 4, complete: true, failed: 0 });
    expect(btn.hidden).toBe(true);
    h.dismiss();
  });

  it('drops Show original when nothing was translated, since there is no other view', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const h = showBatchProgress(3, () => {});
    h.setOnToggleOriginal(() => {});
    const toggle = shadowQuery('[data-ega-batch-cancel]') as HTMLButtonElement;
    h.settle({ done: 3, total: 3, complete: false, failed: 3 });
    expect(toggle.hidden).toBe(true);
    h.settle({ done: 3, total: 3, complete: false, failed: 2 });
    expect(toggle.hidden).toBe(false);
    h.dismiss();
  });

  it('turns the bar red once a settled batch has failures', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const h = showBatchProgress(4, () => {});
    const fill = shadowQuery('[data-ega-batch-bar-fill]') as HTMLElement;
    expect(fill.dataset['tone']).toBeUndefined();
    h.settle({ done: 4, total: 4, complete: false, failed: 2 });
    expect(fill.dataset['tone']).toBe('failed');
    h.dismiss();
  });

  it('Undo all calls its handler both while running and after settle', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const onUndo = vi.fn();
    const onCancel = vi.fn();
    const h = showBatchProgress(3, onCancel);
    h.setOnUndoAll(onUndo);
    const btn = shadowQuery('.undo') as HTMLButtonElement;
    btn.click();
    h.settle({ done: 3, total: 3, complete: true, failed: 0 });
    btn.click();
    expect(onUndo).toHaveBeenCalledTimes(2);
    expect(onCancel).not.toHaveBeenCalled();
    h.dismiss();
  });

  it('a stopped batch says how many areas were kept out of the ones picked', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const h = showBatchProgress(5, () => {});
    h.settle({ done: 2, total: 2, complete: false, failed: 0, stopped: 3 });
    expect(shadowQuery('[data-ega-batch-label]')?.textContent).toBe(
      'Stopped · 2 of 5 areas translated',
    );
    // The bar agrees with the label: 2 kept out of the 5 picked, in a neutral tone.
    const bar = shadowQuery('[data-ega-batch-bar]');
    expect(bar?.getAttribute('aria-valuemax')).toBe('5');
    expect(bar?.getAttribute('aria-valuenow')).toBe('2');
    const fill = shadowQuery('[data-ega-batch-bar-fill]') as HTMLElement;
    expect(fill.style.width).toBe('40%');
    expect(fill.dataset['tone']).toBe('stopped');
    h.dismiss();
  });

  it('a stopped batch with failures counts them too', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const h = showBatchProgress(5, () => {});
    h.settle({ done: 3, total: 3, complete: false, failed: 1, stopped: 2 });
    expect(shadowQuery('[data-ega-batch-label]')?.textContent).toBe(
      'Stopped · 2 of 5 areas translated · 1 failed',
    );
    expect(shadowQuery('[data-ega-batch-bar]')?.getAttribute('aria-valuenow')).toBe('2');
    h.dismiss();
  });

  it('a double-click on Stop stops, and the second click does not show the original', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { showBatchProgress } = await import('@/content/batch-progress');
    const seen: boolean[] = [];
    let h: ReturnType<typeof showBatchProgress> | null = null;
    const onCancel = vi.fn(() => {
      h?.settle({ done: 2, total: 2, complete: false, failed: 0, stopped: 1 });
      h?.setOnToggleOriginal((s) => seen.push(s));
    });
    h = showBatchProgress(3, onCancel);
    const btn = shadowQuery('[data-ega-batch-cancel]') as HTMLButtonElement;

    btn.click();
    btn.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);
    expect(btn.textContent).toBe('Show original');

    pastToggleGuard();
    btn.click();
    expect(seen).toEqual([true]);
    h.dismiss();
  });

  it('Retry failed hiding itself hands focus to Stop, not the page', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const h = showBatchProgress(4, () => {});
    h.settle({ done: 4, total: 4, complete: false, failed: 1 });
    h.setOnRetryFailed(() => h.update(3));
    const retry = shadowQuery('.retry-failed') as HTMLButtonElement;
    retry.focus();

    retry.click();

    expect(retry.hidden).toBe(true);
    const cancel = shadowQuery('[data-ega-batch-cancel]') as HTMLButtonElement;
    expect(cancel.textContent.trim()).toBe('Stop');
    expect(shadowActive()).toBe(cancel);
    h.dismiss();
  });

  it('Stop that leaves nothing translated hands focus to Retry failed', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    let h: ReturnType<typeof showBatchProgress> | null = null;
    h = showBatchProgress(3, () =>
      h?.settle({ done: 1, total: 1, complete: false, failed: 1, stopped: 2 }),
    );
    const cancel = shadowQuery('[data-ega-batch-cancel]') as HTMLButtonElement;
    cancel.focus();

    cancel.click();

    expect(cancel.hidden).toBe(true);
    expect(shadowActive()).toBe(shadowQuery('.retry-failed'));
    h.dismiss();
  });

  it.each(['.undo', '[data-ega-batch-close]'])(
    '%s takes the pill away and focus goes back where it was',
    async (selector) => {
      const { showBatchProgress } = await import('@/content/batch-progress');
      const field = document.createElement('input');
      document.body.appendChild(field);
      const h = showBatchProgress(2, () => {});
      h.setOnUndoAll(() => h.dismiss());
      h.setOnClose(() => h.dismiss());
      field.focus();
      const btn = shadowQuery(selector) as HTMLButtonElement;
      btn.focus();
      expect(document.activeElement).not.toBe(field);

      btn.click();

      expect(document.activeElement).toBe(field);
    },
  );

  it('a window refocus inside the pill keeps where focus came from', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const field = document.createElement('input');
    document.body.appendChild(field);
    const h = showBatchProgress(2, () => {});
    h.setOnUndoAll(() => h.dismiss());
    field.focus();
    const undo = shadowQuery('.undo') as HTMLButtonElement;
    undo.focus();
    // Coming back to the window refocuses the pill button with no relatedTarget.
    undo.dispatchEvent(
      new FocusEvent('focusin', { bubbles: true, composed: true, relatedTarget: null }),
    );
    // A node that has since left the page is no place to send focus either.
    undo.dispatchEvent(
      new FocusEvent('focusin', {
        bubbles: true,
        composed: true,
        relatedTarget: document.createElement('button'),
      }),
    );

    undo.click();

    expect(document.activeElement).toBe(field);
  });

  it('focus that came out of another shadow tree goes back to its host', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const host = document.createElement('div');
    host.tabIndex = 0;
    host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const h = showBatchProgress(2, () => {});
    h.setOnClose(() => h.dismiss());
    const close = shadowQuery('[data-ega-batch-close]') as HTMLButtonElement;
    close.focus();
    close.dispatchEvent(
      new FocusEvent('focusin', { bubbles: true, composed: true, relatedTarget: host }),
    );

    close.click();

    expect(document.activeElement).toBe(host);
  });

  it('a pill that does not hold focus leaves focus alone when it goes', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const field = document.createElement('input');
    const other = document.createElement('input');
    document.body.append(field, other);
    const h = showBatchProgress(2, () => {});
    field.focus();
    (shadowQuery('.undo') as HTMLButtonElement).focus();
    other.focus();

    h.dismiss();

    expect(document.activeElement).toBe(other);
  });

  it('Hide, Stop and Retry failed keep their place in the row while hidden', () => {
    for (const sel of [
      '.ega-batch-progress .retry-failed[hidden]',
      '.ega-batch-progress .cancel[hidden]',
      ".ega-batch-progress .close[data-ready='false']",
    ]) {
      expect(cssRule(sel), sel).toContain('visibility: hidden');
      expect(cssRule(sel), sel).not.toContain('display: none');
    }
  });

  it('Hide is a labeled button that appears once the batch can close', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const h = showBatchProgress(2, () => {});
    const close = shadowQuery('[data-ega-batch-close]') as HTMLButtonElement;
    expect(close.textContent.trim()).toBe('Hide');
    expect(close.dataset['ready']).toBe('false');
    h.setOnClose(() => {});
    expect(close.dataset['ready']).toBe('true');
    h.dismiss();
  });

  it('a toast shown with the pill up is lifted above it, and drops back once the pill goes', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const { showToast, dismissToast } = await import('@/content/toast');
    const h = showBatchProgress(3, () => {});
    const pill = shadowQuery('[data-ega-batch-progress]') as HTMLElement;
    Object.defineProperty(pill, 'offsetHeight', { configurable: true, value: 72 });
    h.update(1);
    showToast('Setup needed');
    const root = shadowQuery('[data-ega-root]') as HTMLElement;
    expect(root.style.getPropertyValue('--ega-batch-progress-h')).toBe('72px');
    const sheet = readFileSync(resolve('src/content/batch-progress.css'), 'utf8');
    expect(sheet).toMatch(
      /\.ega-root:has\(> \[data-ega-batch-progress-wrap\]\) \.ega-toast\s*\{[^}]*var\(--ega-batch-progress-h/,
    );
    // The rule's DOM shape: the pill wrap is a direct child of the root that holds the toast.
    expect(pill.closest('[data-ega-batch-progress-wrap]')?.parentElement).toBe(root);
    expect(root.querySelector('.ega-toast')).not.toBeNull();

    h.dismiss();
    expect(root.style.getPropertyValue('--ega-batch-progress-h')).toBe('');
    expect(root.querySelector('[data-ega-batch-progress-wrap]')).toBeNull();
    dismissToast();
  });

  it('setLiveMessage updates the aria-live region without remounting', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const h = showBatchProgress(5, () => {});
    const before = shadowQuery('[data-ega-batch-live]');
    h.setLiveMessage('Page translation complete.');
    const after = shadowQuery('[data-ega-batch-live]');
    expect(before).toBe(after);
    expect(after?.textContent).toBe('Page translation complete.');
    h.dismiss();
  });

  it('count-label updates do NOT spam the aria-live region', async () => {
    const { showBatchProgress } = await import('@/content/batch-progress');
    const h = showBatchProgress(10, () => {});
    const initialLive = shadowQuery('[data-ega-batch-live]')?.textContent;
    h.update(3);
    h.update(7);
    const afterUpdates = shadowQuery('[data-ega-batch-live]')?.textContent;
    expect(afterUpdates).toBe(initialLive);
    const label = shadowQuery('[data-ega-batch-label]');
    expect(label?.textContent).toMatch(/7.*10/);
    h.dismiss();
  });
});
