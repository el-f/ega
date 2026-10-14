// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const showToastMock = vi.fn();
vi.mock('@/content/toast', () => ({
  showToast: (...a: unknown[]) => showToastMock(...a),
  dismissToast: vi.fn(),
}));

import {
  runWholePageTranslate,
  runPageTranslateV2,
  cancelPageTranslateV2,
  routePageV2Chunk,
  isPageV2Active,
} from '@/content/page-translate-v2';
import { exitMultiSelect, isMultiSelectActive } from '@/content/page-translate-v2/multi-select';
import { SETTINGS_CHANGED_BODY } from '@/shared/error-copy';
import type { BackendId } from '@/shared/types';
import {
  FakeObserver,
  enterAndFire,
  finishAll,
  flush,
  retryButton,
  rig,
} from '@tests/_helpers/page-translate';
import { pillStatus } from '@/content/page-translate-v2/progress';

const N = 12;
function page(): HTMLElement[] {
  document.body.innerHTML = Array.from(
    { length: N },
    (_, i) => `<p id="p${i}">これは${i}番目の段落です。</p>`,
  ).join('');
  return Array.from({ length: N }, (_, i) => document.getElementById(`p${i}`) as HTMLElement);
}

function band(els: HTMLElement[]): void {
  FakeObserver.last?.band(new Set(els));
}

function fail(id: string | undefined, code: string): void {
  routePageV2Chunk({
    type: 'error',
    requestId: id ?? '',
    code: code as never,
    message: 'provider says no',
    backendId: 'anthropic' as BackendId,
  });
}

beforeEach(async () => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  showToastMock.mockClear();
  await cancelPageTranslateV2();
});

afterEach(async () => {
  await cancelPageTranslateV2();
  vi.unstubAllGlobals();
});

describe('whole-page session — a second press, and Choose areas on top', () => {
  it('a newly added area does not subtract from the old areas still untranslated', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    finishAll(r);
    await flush();
    const fresh = document.createElement('p');
    fresh.id = 'fresh';
    fresh.textContent = 'これは新しい段落です。';
    document.body.append(fresh);
    await enterAndFire(r.d, ['p2', 'fresh']);
    finishAll(r, 2);
    await flush();
    const last = r.updates.at(-1);
    expect(last).toMatchObject({ done: 4, total: 4, skipped: 9, settled: true });
    expect(pillStatus(last as never, Date.now())).toBe('Translated 4 of 13 areas.');
  });

  it('a second press after Stop continues the same session, so Remove translation puts back both passes', async () => {
    const els = page();
    const before = document.body.innerHTML;
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    finishAll(r);
    await flush();
    r.stop();

    await runWholePageTranslate(r.d);
    band(els.slice(2, 4));
    await flush();
    finishAll(r, 2);
    await flush();
    expect(r.sent).toHaveLength(4);

    await cancelPageTranslateV2();
    expect(document.body.innerHTML).toBe(before);
  });

  it('a second press while the session still runs does nothing', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    expect(await runWholePageTranslate(r.d)).toBe(true);
    await flush();
    expect(r.sent).toHaveLength(2);
    expect(r.dismissed()).toBe(0);
    expect(els[0]?.querySelector('[data-ega-replaced]')).not.toBeNull();
    // Nothing was collected twice.
    expect(r.updates.at(-1)?.total).toBe(N);
  });

  it('a second press while every block is in flight says nothing: the pill is already there', async () => {
    document.body.innerHTML =
      '<p id="a">これは最初の段落です。</p><p id="b">これは二つ目の段落です。</p>';
    const r = rig();
    await runWholePageTranslate(r.d);
    band([...document.querySelectorAll('p')] as HTMLElement[]);
    await flush();
    expect(await runWholePageTranslate(r.d)).toBe(true);
    expect(showToastMock).not.toHaveBeenCalled();
    expect(r.sent).toHaveLength(2);
  });

  it('Choose areas while the page still translates ends the scroll part and opens area picking', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    await runPageTranslateV2(r.d);
    expect(isMultiSelectActive()).toBe(true);
    exitMultiSelect();
    band(els.slice(5, 8));
    await flush();
    expect(r.sent).toHaveLength(2);
  });
});

describe('whole-page session — blocks the page removes', () => {
  it('a waiting block the page removes leaves the count', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    finishAll(r);
    await flush();
    for (const el of els.slice(6)) el.remove();
    band([]);
    await flush();
    expect(r.updates.at(-1)?.total).toBe(N - 6);
  });

  it('a session whose blocks are all gone closes', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    finishAll(r);
    await flush();
    // An SPA route change swaps the whole view.
    document.body.innerHTML = '<p>Otra página</p>';
    band([]);
    await flush();
    expect(isPageV2Active()).toBe(false);
    expect(r.dismissed()).toBe(1);
  });

  it('the page taking every block away closes the pill with no scroll', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    finishAll(r);
    await flush();
    // No observer entry comes for a waiting block that is removed, so only the page watch can see this.
    document.body.innerHTML = '<p>Otra página</p>';
    await vi.waitFor(() => expect(isPageV2Active()).toBe(false), { timeout: 2000 });
    expect(r.dismissed()).toBe(1);
  });

  it('a route change does not cancel: translations still on the page stay', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    finishAll(r);
    await flush();
    history.pushState({}, '', '/elsewhere');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();
    expect(isPageV2Active()).toBe(true);
    expect(els[0]?.querySelector('[data-ega-replaced]')).not.toBeNull();
    history.pushState({}, '', '/');
  });
});

describe('whole-page session — settling', () => {
  it('settles when the last waiting block is dropped: Close bar works and the settle is announced', async () => {
    const els = page().slice(0, 2);
    document.getElementById('p2')?.remove();
    for (let i = 3; i < N; i++) document.getElementById(`p${i}`)?.remove();
    const r = rig();
    r.d.isTargetLanguage = (t) => t.includes('1番目');
    await runWholePageTranslate(r.d);
    band(els.slice(0, 1));
    await flush();
    finishAll(r);
    await flush();
    expect(r.closeRegistered()).toBe(false);
    band(els.slice(1, 2));
    await flush();
    expect(r.updates.at(-1)?.settled).toBe(true);
    expect(r.closeRegistered()).toBe(true);
    expect(r.live.at(-1)).toBe('Page translated.');
  });

  it('a page whose blocks all read as the target closes and says there is nothing to translate', async () => {
    const els = page();
    const r = rig();
    r.d.isTargetLanguage = () => true;
    await runWholePageTranslate(r.d);
    band(els);
    await flush();
    expect(isPageV2Active()).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('Nothing to translate on this page.');
  });
});

describe('whole-page session — failures', () => {
  it('a settings error stops sending: nothing more goes out after the API key is rejected', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 3));
    await flush();
    fail(r.sent[0]?.id, 'AUTH');
    await flush();
    band(els.slice(3, 7));
    await flush();
    expect(r.sent).toHaveLength(3);
    finishAll(r, 1);
    await flush();
    expect(r.updates.at(-1)).toMatchObject({ settled: true, failed: 1 });
    expect(r.updates.at(-1)?.failure?.actions[0]).toBe('open-settings');
  });

  it('Stop during a rate-limit pause takes the pause off the pill', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    routePageV2Chunk({
      type: 'error',
      requestId: r.sent[0]?.id ?? '',
      code: 'RATE_LIMIT',
      message: '429',
      retryAfterMs: 12_000,
    });
    await flush();
    expect(r.updates.at(-1)?.pausedUntil).toBeDefined();
    r.stop();
    expect(r.updates.at(-1)?.pausedUntil).toBeUndefined();
    expect(r.updates.at(-1)?.pausedBy).toBeUndefined();
  });

  it('a settings change while a settings error shows says so, and Try again leads', async () => {
    document.body.innerHTML = '<p id="p">これは一つだけの段落です。</p>';
    const p = document.getElementById('p') as HTMLElement;
    const r = rig();
    let changed: (() => void) | undefined;
    r.d.onSettingsChange = (fn) => {
      changed = fn;
      return () => (changed = undefined);
    };
    await runWholePageTranslate(r.d);
    band([p]);
    await flush();
    fail(r.sent[0]?.id, 'AUTH');
    await flush();
    expect(r.updates.at(-1)?.failure?.actions[0]).toBe('open-settings');
    changed?.();
    expect(r.updates.at(-1)?.failure?.body).toBe(SETTINGS_CHANGED_BODY);
    expect(r.updates.at(-1)?.failure?.actions[0]).toBe('try-again');
    const chip = p.querySelector('[data-ega-tx-error]');
    expect(chip?.shadowRoot?.querySelector('[data-ega-retry-block]')).not.toBeNull();
  });

  it('Close bar keeps Open settings on a settings error chip, and drops a Try again that needs the pill', async () => {
    document.body.innerHTML =
      '<p id="a">これは最初の段落です。</p><p id="b">これは二つ目の段落です。</p>';
    const a = document.getElementById('a') as HTMLElement;
    const b = document.getElementById('b') as HTMLElement;
    const r = rig();
    await runWholePageTranslate(r.d);
    band([a, b]);
    await flush();
    fail(r.sent[0]?.id, 'AUTH');
    fail(r.sent[1]?.id, 'UNKNOWN');
    await flush();
    r.close();
    const root = (el: HTMLElement): ShadowRoot | null | undefined =>
      el.querySelector('[data-ega-tx-error]')?.shadowRoot;
    expect(root(a)?.querySelector('[data-ega-chip-settings]')).not.toBeNull();
    expect(root(b)?.querySelector('button')).toBeNull();
    expect(root(b)?.querySelector('.chip')?.classList.contains('bare')).toBe(true);
  });
});

describe('whole-page session — a block already in the target language', () => {
  it('on a Hebrew target a Hebrew block is not sent; a block in another script is', async () => {
    document.body.innerHTML =
      '<p id="he">שלום עולם וברוכים הבאים לאתר</p><p id="es">Hola amigo, cómo estás hoy</p>';
    const r = rig();
    delete r.d.isTargetLanguage;
    r.d.target = 'he';
    await runWholePageTranslate(r.d);
    band([...document.querySelectorAll('p')] as HTMLElement[]);
    await flush();
    expect(r.sent.map((s) => s.text)).toEqual(['Hola amigo, cómo estás hoy']);
  });
});

describe('whole-page session — the words before an inner block', () => {
  const comment =
    '<div class="comment"><span id="c">これはコメントの最初の段落です。<p id="c2">これは二つ目の段落です。</p></span></div>';

  it("Replace text translates a comment's first paragraph in place, and Remove translation puts it back", async () => {
    document.body.innerHTML = comment;
    const before = document.body.innerHTML;
    const r = rig();
    await runWholePageTranslate(r.d);
    band([document.getElementById('c'), document.getElementById('c2')] as HTMLElement[]);
    await flush();
    expect(r.sent.map((x) => x.text)).toEqual([
      'これはコメントの最初の段落です。',
      'これは二つ目の段落です。',
    ]);
    finishAll(r);
    await flush();
    const c = document.getElementById('c') as HTMLElement;
    expect(c.firstElementChild?.matches('[data-ega-replaced][data-ega-run]')).toBe(true);
    expect(c.firstElementChild?.textContent).toBe('T');
    expect(c.querySelector('#c2 [data-ega-replaced]')?.textContent).toBe('T');
    expect(r.updates.at(-1)).toMatchObject({ settled: true, total: 2 });
    // A second press takes nothing twice.
    expect(await runWholePageTranslate(r.d)).toBe(false);
    await cancelPageTranslateV2();
    expect(document.body.innerHTML).toBe(before);
  });

  it("Show both puts the first paragraph's translation before the second paragraph, and a retry keeps the inner block", async () => {
    document.body.innerHTML = comment;
    const r = rig();
    r.d.getSettings = () =>
      Promise.resolve({ pageTranslateMode: 'bilingual', batchConcurrency: 3 } as never);
    await runWholePageTranslate(r.d);
    band([document.getElementById('c'), document.getElementById('c2')] as HTMLElement[]);
    await flush();
    fail(r.sent[0]?.id, 'UNKNOWN');
    finishAll(r, 1);
    await flush();
    const c = document.getElementById('c') as HTMLElement;
    const box = c.querySelector(':scope > [data-ega-run]');
    expect(box?.nextElementSibling?.id).toBe('c2');
    expect(box?.getAttribute('data-ega-tx-state')).toBe('error');
    // Try again sends the run again; the second paragraph keeps its translation.
    retryButton(c)?.click();
    await flush();
    expect(r.sent.at(-1)?.text).toBe('これはコメントの最初の段落です。');
    expect(document.getElementById('c2')?.nextElementSibling?.textContent).toBe('T');
  });
});

describe('whole-page session — round 2', () => {
  it('a waiting block the page hides (another tab) leaves the count, so the session can settle', async () => {
    document.body.innerHTML =
      '<div id="desc"><p id="a">これは説明の段落です。</p><p id="b">これは二つ目の説明です。</p></div>' +
      '<div id="rev"><p id="c">これはレビューの段落です。</p></div>';
    const proto = HTMLElement.prototype as unknown as { checkVisibility?: () => boolean };
    const had = Object.prototype.hasOwnProperty.call(proto, 'checkVisibility');
    const original = proto.checkVisibility;
    proto.checkVisibility = function (this: HTMLElement) {
      return this.closest('[hidden]') === null;
    };
    try {
      const r = rig();
      await runWholePageTranslate(r.d);
      const a = document.getElementById('a') as HTMLElement;
      band([a]);
      await flush();
      finishAll(r);
      await flush();
      (document.getElementById('desc') as HTMLElement).hidden = true;
      (document.getElementById('rev') as HTMLElement).hidden = true;
      band([]);
      await flush();
      expect(r.updates.at(-1)).toMatchObject({ settled: true, total: 1 });
    } finally {
      if (had && original) proto.checkVisibility = original;
      else delete proto.checkVisibility;
    }
  });

  it('a press drops the waiting blocks the page hid before it looks for new ones, so the pill can settle', async () => {
    // The Reviews tab was hidden when the page was collected; the user then switches tabs.
    document.body.innerHTML =
      '<div id="desc"><p id="a">これは説明の段落です。</p><p id="b">これは二つ目の説明です。</p></div>' +
      '<div id="rev" hidden><p id="c">これはレビューの段落です。</p></div>';
    const proto = HTMLElement.prototype as unknown as { checkVisibility?: () => boolean };
    const had = Object.prototype.hasOwnProperty.call(proto, 'checkVisibility');
    const original = proto.checkVisibility;
    proto.checkVisibility = function (this: HTMLElement) {
      return this.closest('[hidden]') === null;
    };
    try {
      const r = rig();
      await runWholePageTranslate(r.d);
      band([document.getElementById('a') as HTMLElement]);
      await flush();
      finishAll(r);
      await flush();
      (document.getElementById('desc') as HTMLElement).hidden = true;
      (document.getElementById('rev') as HTMLElement).hidden = false;
      // No observer entry comes for a block that is hidden without ever coming near; the press sweeps it.
      expect(await runWholePageTranslate(r.d)).toBe(true);
      expect(r.updates.at(-1)).toMatchObject({ total: 2, waiting: 1 });
      band([document.getElementById('c') as HTMLElement]);
      await flush();
      finishAll(r, 1);
      await flush();
      expect(r.sent.at(-1)?.text).toBe('これはレビューの段落です。');
      expect(r.updates.at(-1)).toMatchObject({ settled: true, total: 2 });
    } finally {
      if (had && original) proto.checkVisibility = original;
      else delete proto.checkVisibility;
    }
  });

  it('areas chosen after the scroll part gave way count once, and the pill does not read as stopped', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    finishAll(r);
    await flush();
    // Choose areas ends the scroll part; the user picks two of the areas it dropped.
    await enterAndFire(r.d, ['p5', 'p6']);
    finishAll(r, 2);
    await flush();
    const last = r.updates.at(-1);
    expect(last).toMatchObject({ settled: true, done: 4, total: 4, skipped: 8 });
    expect(pillStatus(last as never, Date.now())).toBe('Translated 4 of 12 areas.');
  });

  it('a press on a session that only waits for scroll adds the blocks the page gained since', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    finishAll(r);
    await flush();
    const added = document.createElement('p');
    added.textContent = 'これは後から来た段落です。';
    document.body.append(added);
    expect(await runWholePageTranslate(r.d)).toBe(true);
    expect(r.updates.at(-1)?.total).toBe(N + 1);
    band([added]);
    await flush();
    expect(r.sent.at(-1)?.text).toBe('これは後から来た段落です。');
  });

  it('a translated block whose translation the page wiped is taken again on the next press', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 1));
    await flush();
    finishAll(r);
    await flush();
    // A live feed re-renders the block in place, which removes Ega's wrapper.
    (els[0] as HTMLElement).textContent = 'これは書き換えられた段落です。';
    await runWholePageTranslate(r.d);
    expect(r.updates.at(-1)?.total).toBe(N);
    band(els.slice(0, 1));
    await flush();
    expect(r.sent.at(-1)?.text).toBe('これは書き換えられた段落です。');
  });

  it('a settings stop parks the rest instead of stopping it, and Try again after the fix picks the page up again', async () => {
    const els = page();
    const r = rig();
    let changed: (() => void) | undefined;
    let retry: (() => void) | undefined;
    r.d.onSettingsChange = (fn) => {
      changed = fn;
      return () => (changed = undefined);
    };
    r.handle.setOnRetryFailed = (fn) => (retry = fn);
    await runWholePageTranslate(r.d);
    band(els.slice(0, 3));
    await flush();
    fail(r.sent[0]?.id, 'AUTH');
    finishAll(r, 1);
    await flush();
    const settled = r.updates.at(-1);
    expect(settled).toMatchObject({ settled: true, skipped: 0, total: 3, failed: 1 });
    expect(pillStatus(settled as never, Date.now())).not.toMatch(/^Stopped/);
    changed?.();
    retry?.();
    await flush();
    expect(r.updates.at(-1)).toMatchObject({ settled: false, total: N });
    band(els.slice(3, 5));
    await flush();
    expect(r.sent.map((x) => x.text)).toContain('これは3番目の段落です。');
  });

  it('a press while Show original is on brings the translation back, so new areas do not land hidden', async () => {
    const els = page();
    const r = rig();
    let toggle: ((on: boolean) => void) | undefined;
    r.handle.setOnToggleOriginal = (fn) => (toggle = fn);
    await runWholePageTranslate(r.d);
    band(els.slice(0, 1));
    await flush();
    finishAll(r);
    await flush();
    r.stop();
    toggle?.(true);
    expect(r.updates.at(-1)?.showingOriginal).toBe(true);
    await runWholePageTranslate(r.d);
    expect(r.updates.at(-1)?.showingOriginal).toBe(false);
    expect(els[0]?.querySelector('[data-ega-replaced]')?.textContent).toBe('T');
  });

  it('Close after a settings change gives a settings error chip its Open settings back', async () => {
    document.body.innerHTML = '<p id="p">これは一つだけの段落です。</p>';
    const p = document.getElementById('p') as HTMLElement;
    const r = rig();
    let changed: (() => void) | undefined;
    r.d.onSettingsChange = (fn) => {
      changed = fn;
      return () => (changed = undefined);
    };
    await runWholePageTranslate(r.d);
    band([p]);
    await flush();
    fail(r.sent[0]?.id, 'AUTH');
    await flush();
    changed?.();
    r.close();
    const root = p.querySelector('[data-ega-tx-error]')?.shadowRoot;
    expect(root?.querySelector('[data-ega-chip-settings]')).not.toBeNull();
    expect(root?.querySelector('[data-ega-retry-block]')).toBeNull();
  });
});
