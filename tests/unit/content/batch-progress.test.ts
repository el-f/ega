// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { flushSync } from 'svelte';
import type { PageProgress } from '@/content/page-translate-v2/progress';

import type * as BatchMod from '@/content/batch-progress';

type Mod = typeof BatchMod;
let mod: Mod;

function q(selector: string): HTMLElement | null {
  return (
    document.getElementById('ega-shadow-host')?.shadowRoot?.querySelector<HTMLElement>(selector) ??
    null
  );
}

function button(name: string): HTMLButtonElement | null {
  const root = document.getElementById('ega-shadow-host')?.shadowRoot;
  const all = [
    ...(root?.querySelectorAll<HTMLButtonElement>('[data-ega-batch-progress] button') ?? []),
  ];
  return all.find((b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === name) ?? null;
}

function shadowActive(): Element | null {
  return document.getElementById('ega-shadow-host')?.shadowRoot?.activeElement ?? null;
}

const running: PageProgress = {
  done: 3,
  failed: 0,
  total: 10,
  waiting: 0,
  inFlight: 3,
  queued: 4,
  skipped: 0,
  settled: false,
};
const settled: PageProgress = { ...running, done: 10, inFlight: 0, queued: 0, settled: true };

function show(p: PageProgress = running): ReturnType<Mod['showBatchProgress']> & { stop: Mock } {
  const stop = vi.fn();
  const h = mod.showBatchProgress(p.total, stop);
  h.update(p);
  flushSync();
  return Object.assign(h, { stop });
}

beforeAll(async () => {
  mod = await import('@/content/batch-progress');
}, 60_000);

afterEach(() => {
  vi.useRealTimers();
  if (mod.isBatchProgressActive()) mod.showBatchProgress(1, () => {}).dismiss();
});

describe('the page-translate pill', () => {
  it('mounts once; a second pill replaces the first', () => {
    show();
    show();
    expect(
      document
        .getElementById('ega-shadow-host')
        ?.shadowRoot?.querySelectorAll('[data-ega-batch-progress]'),
    ).toHaveLength(1);
  });

  it('while running: one status sentence, a progress line, and Stop', () => {
    const h = show();
    expect(q('[data-ega-batch-label]')?.textContent).toBe('Translating 3 of 10 areas…');
    const bar = q('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('3');
    expect(bar?.getAttribute('aria-valuemax')).toBe('10');
    button('Stop')?.click();
    expect(h.stop).toHaveBeenCalledOnce();
    expect(button('Close bar')).toBeNull();
  });

  it('idle while the rest waits for scroll: no progress line, since nothing is in flight', () => {
    show({ ...running, done: 10, total: 48, waiting: 38, inFlight: 0, queued: 0 });
    expect(q('[data-ega-batch-label]')?.textContent).toBe(
      '10 of 48 areas translated. The rest translate as you scroll.',
    );
    expect(q('[role="progressbar"]')).toBeNull();
  });

  it('a settled page drops the line, names the target, and offers Show original as a toggle', () => {
    const h = show();
    const toggle = vi.fn();
    h.setOnToggleOriginal(toggle);
    h.update({ ...settled, target: 'English' });
    flushSync();
    expect(q('[role="progressbar"]')).toBeNull();
    expect(q('[data-ega-batch-label]')?.textContent).toBe('Page translated to English');
    const original = button('Show original');
    expect(original?.getAttribute('aria-pressed')).toBe('false');
    original?.click();
    flushSync();
    expect(toggle).toHaveBeenLastCalledWith(true);
    expect(original?.getAttribute('aria-pressed')).toBe('true');
    // The label stays the same; the pressed state carries the meaning.
    expect(original?.textContent.trim()).toBe('Show original');
    // The status says what is on the page.
    expect(q('[data-ega-batch-label]')?.textContent).toBe('Showing the original page');
    original?.click();
    flushSync();
    expect(q('[data-ega-batch-label]')?.textContent).toBe('Page translated to English');
  });

  it('the session owns Show original: a press that brings the translation back un-presses it', () => {
    const h = show();
    h.update({ ...settled, target: 'English' });
    flushSync();
    button('Show original')?.click();
    flushSync();
    h.update({ ...settled, target: 'English', showingOriginal: true });
    flushSync();
    // A second Translate page press switches the page back and says so in its snapshot.
    h.update({ ...settled, target: 'English', showingOriginal: false });
    flushSync();
    expect(button('Show original')?.getAttribute('aria-pressed')).toBe('false');
    expect(q('[data-ega-batch-label]')?.textContent).toBe('Page translated to English');
  });

  it('Stop that settles the pill hands focus to the next control, not the page', async () => {
    const h = show();
    button('Stop')?.focus();
    h.update({ ...settled, done: 4, total: 4, skipped: 6 });
    flushSync();
    expect(q('[data-ega-batch-label]')?.textContent).toBe('Stopped. Translated 4 of 10 areas.');
    await vi.waitFor(() => expect(shadowActive()).toBe(button('Show original')));
  });

  it('the settled actions are one toolbar stop; arrows, Home and End move along it', async () => {
    const h = show();
    h.update({ ...settled, target: 'English' });
    flushSync();
    const bar = q('[role="toolbar"]');
    expect(bar?.getAttribute('aria-label')).toBe('Page translation actions');
    const items = [...(bar?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    expect(items.map((b) => b.getAttribute('aria-label') ?? b.textContent.trim())).toEqual([
      'Show original',
      'More',
      'Close bar',
    ]);
    // The buttons changed with the state; the stop lands once the DOM settles.
    await vi.waitFor(() => expect(items.filter((b) => b.tabIndex === 0)).toEqual([items[0]]));
    items[0]?.focus();
    items[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(shadowActive()).toBe(items[1]);
    // The stop follows focus, so Tab comes back to the button the user left.
    await vi.waitFor(() => expect(items.filter((b) => b.tabIndex === 0)).toEqual([items[1]]));
    items[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(shadowActive()).toBe(items[2]);
    items[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(shadowActive()).toBe(items[0]);
    items[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(shadowActive()).toBe(items[2]);
    items[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(shadowActive()).toBe(items[0]);
  });

  it('Close bar ignores the second click of a double-click on Stop', () => {
    vi.useFakeTimers();
    const h = show();
    const close = vi.fn();
    h.setOnClose(close);
    h.update(settled);
    flushSync();
    button('Close bar')?.click();
    expect(close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    button('Close bar')?.click();
    expect(close).toHaveBeenCalledOnce();
  });

  it('failures: the cause sentence, Try again with the count in its name, and Error details from More', async () => {
    const h = show();
    const retry = vi.fn();
    h.setOnRetryFailed(retry);
    h.update({
      ...settled,
      failed: 2,
      failure: {
        body: 'Anthropic took too long to answer.',
        actions: ['try-again', 'open-settings'],
        tab: 'backends',
        details: ['Anthropic HTTP 529: overloaded'],
      },
    });
    flushSync();
    expect(q('[data-ega-batch-label]')?.textContent).toBe(
      "Couldn't translate 2 of 10 areas. Anthropic took too long to answer.",
    );
    const tryAgain = button('Try again, 2 failed areas');
    expect(tryAgain?.textContent.trim()).toBe('Try again');
    expect(tryAgain?.classList.contains('first')).toBe(true);
    tryAgain?.click();
    expect(retry).toHaveBeenCalledOnce();
    // The raw text never shows until the user asks for it.
    expect(q('[data-ega-batch-progress]')?.textContent).not.toContain('529');
    button('More')?.click();
    flushSync();
    const details = [...(q('[role="menu"]')?.querySelectorAll('[role="menuitem"]') ?? [])].find(
      (b) => b.textContent === 'Show error details',
    ) as HTMLElement;
    details.click();
    flushSync();
    expect(q('[data-ega-batch-details]')?.textContent).toContain('Anthropic HTTP 529: overloaded');
  });

  it('a settings fix puts Open settings first and opens the right tab', () => {
    const send = chrome.runtime.sendMessage as unknown as Mock;
    const h = show();
    h.update({
      ...settled,
      done: 10,
      failed: 10,
      failure: {
        body: 'Anthropic did not accept the saved API key.',
        actions: ['open-settings', 'try-again'],
        tab: 'backends',
        details: ['401'],
      },
    });
    flushSync();
    const buttons = [...(q('.actions')?.querySelectorAll('button') ?? [])].map(
      (b) => b.getAttribute('aria-label') ?? b.textContent.trim(),
    );
    // Nothing was translated, so there is no other view to show.
    expect(buttons).toEqual(['Open settings', 'Try again, 10 failed areas', 'More', 'Close bar']);
    button('Open settings')?.click();
    expect(send).toHaveBeenCalledWith({ kind: 'ui:open-options', tab: 'backends' });
  });

  it('More holds Remove translation', () => {
    const h = show();
    const remove = vi.fn();
    h.setOnUndoAll(remove);
    h.update(settled);
    flushSync();
    const more = button('More');
    expect(more?.getAttribute('aria-haspopup')).toBe('menu');
    more?.click();
    flushSync();
    expect(more?.getAttribute('aria-expanded')).toBe('true');
    (q('[data-ega-batch-remove]') as HTMLElement).click();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('a rate limit reads as a pause with a countdown, not an error', () => {
    vi.useFakeTimers();
    show({ ...running, pausedUntil: Date.now() + 12_000, pausedBy: 'Anthropic' });
    expect(q('[data-ega-batch-label]')?.textContent).toBe(
      'Paused: Anthropic is limiting requests. Resuming in 12 s.',
    );
    vi.advanceTimersByTime(3000);
    flushSync();
    expect(q('[data-ega-batch-label]')?.textContent).toBe(
      'Paused: Anthropic is limiting requests. Resuming in 9 s.',
    );
  });

  it('progress updates change the status, never the polite announcement', () => {
    const h = show();
    const live = q('[data-ega-batch-live]');
    expect(live?.getAttribute('role')).toBe('status');
    const before = live?.textContent;
    h.update({ ...running, done: 7 });
    flushSync();
    expect(q('[data-ega-batch-live]')?.textContent).toBe(before);
    h.setLiveMessage('Page translated.');
    flushSync();
    expect(q('[data-ega-batch-live]')?.textContent).toBe('Page translated.');
  });

  it('a button that removes the pill sends focus back to where it came from', () => {
    const field = document.createElement('input');
    document.body.appendChild(field);
    const h = show();
    h.setOnClose(() => h.dismiss());
    h.update(settled);
    flushSync();
    vi.useFakeTimers();
    vi.advanceTimersByTime(500);
    field.focus();
    const close = button('Close bar') as HTMLButtonElement;
    close.focus();
    close.dispatchEvent(
      new FocusEvent('focusin', { bubbles: true, composed: true, relatedTarget: field }),
    );
    close.click();
    expect(document.activeElement).toBe(field);
    field.remove();
  });

  it('a toast shown with the pill up is lifted above it, and drops back once the pill goes', async () => {
    const { showToast, dismissToast } = await import('@/content/toast');
    const h = show();
    const pill = q('[data-ega-batch-progress]') as HTMLElement;
    Object.defineProperty(pill, 'offsetHeight', { configurable: true, value: 72 });
    h.update(running);
    await Promise.resolve();
    showToast('Setup needed');
    const root = q('[data-ega-root]') as HTMLElement;
    expect(root.style.getPropertyValue('--ega-batch-progress-h')).toBe('72px');
    const sheet = readFileSync(resolve('src/content/batch-progress.css'), 'utf8');
    expect(sheet).toMatch(
      /\.ega-root:has\(> \[data-ega-batch-progress-wrap\]\)[^{]* \.ega-toast\s*\{[^}]*var\(--ega-batch-progress-h/,
    );
    h.dismiss();
    expect(root.style.getPropertyValue('--ega-batch-progress-h')).toBe('');
    dismissToast();
  });
});

const failedSettled: PageProgress = {
  ...settled,
  done: 10,
  failed: 2,
  failure: {
    body: 'Anthropic took too long to answer.',
    actions: ['try-again', 'open-settings'],
    tab: 'backends',
    details: ['Anthropic HTTP 529: overloaded'],
  },
};

function menuItem(name: string): HTMLElement | null {
  const items = [...(q('[role="menu"]')?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  return items.find((b) => b.textContent.trim() === name) ?? null;
}

describe('the pill — states, the More menu and Error details', () => {
  it('a pause that starts later counts down from when it starts', () => {
    vi.useFakeTimers();
    const h = show();
    vi.advanceTimersByTime(60_000);
    h.update({ ...running, pausedUntil: Date.now() + 11_200, pausedBy: 'Anthropic' });
    flushSync();
    expect(q('[data-ega-batch-label]')?.textContent).toBe(
      'Paused: Anthropic is limiting requests. Resuming in 12 s.',
    );
  });

  it('a settings error after a settings change leads with Try again and keeps Open settings', () => {
    const h = show();
    h.update({
      ...settled,
      failed: 10,
      failure: {
        body: 'Settings changed. Try again to use them.',
        actions: ['try-again', 'open-settings'],
        tab: 'backends',
        details: ['401'],
        settingsChanged: true,
      },
    });
    flushSync();
    const names = [...(q('.actions')?.querySelectorAll('button') ?? [])].map(
      (b) => b.getAttribute('aria-label') ?? b.textContent.trim(),
    );
    expect(names).toEqual(['Try again, 10 failed areas', 'Open settings', 'More', 'Close bar']);
    expect(button('Try again, 10 failed areas')?.classList.contains('first')).toBe(true);
  });

  it('More opens a menu outside the pill box that Escape, Tab, a click outside and focus leaving all close', async () => {
    const h = show();
    h.update(settled);
    flushSync();
    const more = button('More') as HTMLButtonElement;
    more.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    flushSync();
    const menu = q('[role="menu"]');
    expect(menu).not.toBeNull();
    // Drawn above the pill, outside the box that holds the row, so the row never moves.
    expect(menu?.closest('.frame')).toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('true');
    more.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(q('[role="menu"]')).toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('false');

    more.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    flushSync();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    flushSync();
    expect(q('[role="menu"]')).toBeNull();

    more.click();
    flushSync();
    await vi.waitFor(() => expect(shadowActive()?.getAttribute('role')).toBe('menuitem'));
    shadowActive()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    flushSync();
    expect(q('[role="menu"]')).toBeNull();

    more.click();
    flushSync();
    await vi.waitFor(() => expect(shadowActive()?.getAttribute('role')).toBe('menuitem'));
    shadowActive()?.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }),
    );
    flushSync();
    expect(q('[role="menu"]')).toBeNull();
  });

  it('the menu sits above the pill, and the pill box no longer clips it', () => {
    const sheet = readFileSync(resolve('src/content/batch-progress.css'), 'utf8');
    const rule = (sel: string): string => {
      const at = sheet.indexOf('\n' + sel + ' {');
      return at < 0 ? '' : sheet.slice(at, sheet.indexOf('}', at));
    };
    expect(rule('.ega-batch-progress .menu')).toMatch(/position: absolute/);
    expect(rule('.ega-batch-progress .menu')).toMatch(/inset-block-end: calc\(100%/);
    expect(rule('.ega-batch-progress')).not.toMatch(/overflow/);
  });

  it('Error details opens from More and closes again; focus goes to Copy, then back to More', async () => {
    const h = show();
    h.update(failedSettled);
    flushSync();
    button('More')?.click();
    flushSync();
    menuItem('Show error details')?.click();
    flushSync();
    expect(q('[data-ega-batch-details]')).not.toBeNull();
    await vi.waitFor(() => expect(shadowActive()).toBe(q('[data-ega-batch-details] button')));

    button('More')?.click();
    flushSync();
    menuItem('Hide error details')?.click();
    flushSync();
    expect(q('[data-ega-batch-details]')).toBeNull();
    await vi.waitFor(() => expect(shadowActive()).toBe(button('More')));
  });

  it('Copy says Copied for a moment and announces it; a failed copy says so', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const h = show();
    h.update(failedSettled);
    flushSync();
    button('More')?.click();
    flushSync();
    menuItem('Show error details')?.click();
    flushSync();
    const copy = q('[data-ega-batch-details] button') as HTMLButtonElement;
    vi.useFakeTimers();
    copy.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledWith('Anthropic HTTP 529: overloaded');
    expect(copy.textContent.trim()).toBe('Copied');
    expect(q('[data-ega-batch-live]')?.textContent).toBe('Error details copied.');
    await vi.advanceTimersByTimeAsync(1500);
    expect(copy.textContent.trim()).toBe('Copy');

    write.mockRejectedValueOnce(new Error('denied'));
    copy.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(copy.textContent.trim()).toBe('Copy');
    expect(q('[data-ega-batch-live]')?.textContent).toBe("Couldn't copy the error details.");
  });

  it('Error details that scroll take focus and carry a name; short ones do not', async () => {
    const h = show();
    h.update(failedSettled);
    flushSync();
    button('More')?.click();
    flushSync();
    menuItem('Show error details')?.click();
    flushSync();
    const text = q('.details-text') as HTMLElement;
    expect(text.hasAttribute('tabindex')).toBe(false);
    button('More')?.click();
    flushSync();
    menuItem('Hide error details')?.click();
    flushSync();

    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(72);
    button('More')?.click();
    flushSync();
    menuItem('Show error details')?.click();
    flushSync();
    await vi.waitFor(() => expect(q('.details-text')?.getAttribute('tabindex')).toBe('0'));
    expect(q('.details-text')?.getAttribute('role')).toBe('region');
    expect(q('.details-text')?.getAttribute('aria-label')).toBe('Error details');
  });

  it('focus that came from a page chip goes back to the chip button, not its host', async () => {
    const { mountErrorChip } = await import('@/content/page-chip');
    const chip = mountErrorChip({ code: 'AUTH', message: '401' });
    document.body.appendChild(chip);
    const h = show();
    h.setOnClose(() => h.dismiss());
    h.update(settled);
    flushSync();
    vi.useFakeTimers();
    vi.advanceTimersByTime(500);
    const settings = chip.shadowRoot?.querySelector('button') as HTMLButtonElement;
    const close = button('Close bar') as HTMLButtonElement;
    close.focus();
    // Focus from another shadow tree arrives retargeted to its host.
    close.dispatchEvent(
      new FocusEvent('focusin', { bubbles: true, composed: true, relatedTarget: chip }),
    );
    close.click();
    expect(chip.shadowRoot?.activeElement).toBe(settings);
    chip.remove();
  });

  it('a pill that grows on its own (More, Error details) re-measures the toast offset', () => {
    let callback: (() => void) | undefined;
    const observed = new Set<Element>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          callback = cb;
        }
        observe(el: Element): void {
          observed.add(el);
        }
        disconnect(): void {
          observed.clear();
        }
      },
    );
    // Fires only for a box the observer watches, as the real one does.
    const resize = (el: Element): void => {
      if (observed.has(el)) callback?.();
    };
    show();
    const pill = q('[data-ega-batch-progress]') as HTMLElement;
    Object.defineProperty(pill, 'offsetHeight', { configurable: true, value: 122 });
    resize(pill);
    const root = q('[data-ega-root]') as HTMLElement;
    expect(root.style.getPropertyValue('--ega-batch-progress-h')).toBe('122px');
  });
});
