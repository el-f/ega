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
import { FakeObserver, finishAll, flush, rig } from '@tests/_helpers/page-translate';

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
