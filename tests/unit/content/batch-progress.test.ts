// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function shadowQuery(selector: string): Element | null {
  const host = document.getElementById('ega-shadow-host') as HTMLElement | null;
  const root = host?.shadowRoot;
  return root?.querySelector(selector) ?? null;
}

function shadowQueryAll(selector: string): Element[] {
  const host = document.getElementById('ega-shadow-host') as HTMLElement | null;
  const root = host?.shadowRoot;
  return root ? Array.from(root.querySelectorAll(selector)) : [];
}

describe('batch-progress lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // The host lives on documentElement, so clearing body keeps it; dismiss() clears `active`, so the next toast mounts clean.
  });

  afterEach(async () => {
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
    expect(btn.getAttribute('aria-label')).toBe('Show the translated page text');

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
    expect(shadowQuery('[data-ega-batch-bar]')?.getAttribute('aria-valuemax')).toBe('2');
    h.dismiss();
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
