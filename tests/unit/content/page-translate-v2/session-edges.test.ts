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
import { SETTINGS_CHANGED_BODY } from '@/shared/error-copy';
import { backendLabel } from '@/shared/backends/provider-profiles';
import type { BackendId } from '@/shared/types';
import {
  FakeObserver,
  enterAndFire,
  finishAll,
  flush,
  rig,
  type PageRig,
  chipText,
} from '@tests/_helpers/page-translate';

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

function fail(
  r: PageRig,
  index: number,
  code: string,
  extra: { message?: string; backendId?: BackendId } = {},
): void {
  routePageV2Chunk({
    type: 'error',
    requestId: r.sent[index]?.id ?? '',
    code: code as never,
    message: extra.message ?? 'provider says no',
    ...(extra.backendId ? { backendId: extra.backendId } : {}),
  });
}

function withSettingsChange(r: PageRig): () => void {
  let changed: () => void = () => {};
  r.d.onSettingsChange = (fn) => {
    changed = fn;
    return () => {
      changed = () => {};
    };
  };
  return () => changed();
}

beforeEach(async () => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  showToastMock.mockClear();
  await cancelPageTranslateV2();
});

afterEach(async () => {
  await cancelPageTranslateV2();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Translate page pressed twice in a row', () => {
  function countMounts(r: PageRig): () => number {
    let mounts = 0;
    const mount = r.d.mountProgress;
    r.d.mountProgress = (total, stop) => {
      mounts++;
      return (mount as NonNullable<typeof mount>)(total, stop);
    };
    return () => mounts;
  }

  it('a second press while the first still reads the settings starts nothing', async () => {
    page();
    const r = rig();
    const mounts = countMounts(r);
    const [first, second] = await Promise.all([
      runWholePageTranslate(r.d),
      runWholePageTranslate(r.d),
    ]);
    expect([first, second]).toEqual([true, true]);
    expect(mounts()).toBe(1);
  });

  it('a press while Choose areas is starting its session starts nothing', async () => {
    page();
    const r = rig();
    const mounts = countMounts(r);
    await runPageTranslateV2(r.d);
    document.getElementById('p0')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(await runWholePageTranslate(r.d)).toBe(true);
    await flush();
    expect(mounts()).toBe(1);
    expect(r.updates.at(-1)?.total).toBe(1);
  });

  it('a press while area picking is open closes the picker', async () => {
    page();
    const r = rig();
    await runPageTranslateV2(r.d);
    await runWholePageTranslate(r.d);
    expect(
      document.getElementById('ega-shadow-host')?.shadowRoot?.querySelector('[data-ega-ms-count]'),
    ).toBeNull();
  });
});

describe('a later press on the whole-page session', () => {
  it('says there is nothing to translate when the page gained nothing and nothing is left', async () => {
    document.body.innerHTML = '<p id="a">これは一つだけの段落です。</p>';
    const r = rig();
    await runWholePageTranslate(r.d);
    band([document.getElementById('a') as HTMLElement]);
    await flush();
    finishAll(r);
    await flush();
    expect(await runWholePageTranslate(r.d)).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('Nothing to translate on this page.');
  });

  it('a press before any block came near keeps the session and its pill', async () => {
    page();
    const r = rig();
    await runWholePageTranslate(r.d);
    expect(await runWholePageTranslate(r.d)).toBe(true);
    expect(isPageV2Active()).toBe(true);
    expect(r.dismissed()).toBe(0);
    expect(r.updates.at(-1)).toMatchObject({ total: N, waiting: N });
  });

  it('says so when a page has no text at all', async () => {
    document.body.innerHTML = '<p>42</p>';
    expect(await runWholePageTranslate(rig().d)).toBe(false);
    expect(showToastMock).toHaveBeenCalledWith('Nothing to translate on this page.');
  });

  it('stays quiet and keeps going while blocks still wait for scroll', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    finishAll(r);
    await flush();
    expect(await runWholePageTranslate(r.d)).toBe(true);
    expect(showToastMock).not.toHaveBeenCalled();
    expect(r.updates.at(-1)).toMatchObject({ total: N, waiting: N - 2 });
  });

  it('stays quiet and sends a failed block again when nothing else is left', async () => {
    document.body.innerHTML = '<p id="a">これは一つだけの段落です。</p>';
    const r = rig();
    await runWholePageTranslate(r.d);
    band([document.getElementById('a') as HTMLElement]);
    await flush();
    fail(r, 0, 'UNKNOWN');
    await flush();
    expect(await runWholePageTranslate(r.d)).toBe(true);
    await flush();
    expect(showToastMock).not.toHaveBeenCalled();
    expect(r.sent).toHaveLength(2);
  });

  it('a block that was queued behind the others and left the page leaves the count', async () => {
    const els = page();
    const texts = els.map((e) => e.textContent);
    const r = rig(1);
    await runWholePageTranslate(r.d);
    band(els.slice(0, 3));
    await flush();
    els[1]?.remove();
    await runWholePageTranslate(r.d);
    expect(r.updates.at(-1)).toMatchObject({ total: N - 1, queued: 1 });
    finishAll(r);
    await flush();
    finishAll(r, 1);
    await flush();
    expect(r.sent.map((s) => s.text)).toEqual([texts[0], texts[2]]);
  });

  it('a block a first press judged as the target is judged again for a new target', async () => {
    document.body.innerHTML =
      '<p id="he">שלום עולם וברוכים הבאים לאתר</p><p id="ja">これは日本語の段落です。</p>';
    const r = rig();
    delete r.d.isTargetLanguage;
    r.d.target = 'he';
    await runWholePageTranslate(r.d);
    const all = [...document.querySelectorAll('p')] as HTMLElement[];
    band(all);
    await flush();
    finishAll(r);
    await flush();
    expect(r.sent.map((s) => s.text)).toEqual(['これは日本語の段落です。']);

    await runWholePageTranslate({ ...r.d, target: 'fr' });
    band(all);
    await flush();
    expect(r.sent.map((s) => s.text)).toEqual([
      'これは日本語の段落です。',
      'שלום עולם וברוכים הבאים לאתר',
    ]);
  });

  it('a press after a settings stop sends the page again, and Stop then counts what it drops', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    fail(r, 0, 'AUTH');
    finishAll(r, 1);
    await flush();
    expect(r.updates.at(-1)).toMatchObject({ settled: true, skipped: 0 });

    await runWholePageTranslate(r.d);
    band(els.slice(2, 4));
    await flush();
    r.stop();
    expect(r.updates.at(-1)?.skipped).toBeGreaterThan(0);
  });

  it('Try again after a settings stop picks the page up, and Stop then counts what it drops', async () => {
    const els = page();
    const r = rig();
    let retry: (() => void) | undefined;
    r.handle.setOnRetryFailed = (fn) => (retry = fn);
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    fail(r, 0, 'AUTH');
    finishAll(r, 1);
    await flush();
    retry?.();
    await flush();
    band(els.slice(2, 4));
    await flush();
    r.stop();
    expect(r.updates.at(-1)?.skipped).toBeGreaterThan(0);
  });
});

describe('the pill count of areas the user picked', () => {
  it('a fresh session is neither partial, nor past the cap, nor has too long areas', async () => {
    page();
    const r = rig();
    await enterAndFire(r.d, ['p0']);
    const last = r.updates.at(-1);
    expect(last?.partialSelection).toBeUndefined();
    expect(last?.tooLong).toBeUndefined();
    expect(last?.pastCap).toBeUndefined();
    expect(last?.failure).toBeUndefined();
  });

  it('picking more areas after a finished pick is not a partial resume', async () => {
    page();
    const r = rig();
    await enterAndFire(r.d, ['p0']);
    finishAll(r);
    await flush();
    await enterAndFire(r.d, ['p1']);
    finishAll(r, 1);
    await flush();
    expect(r.updates.at(-1)).toMatchObject({ done: 2, total: 2, settled: true });
    expect(r.updates.at(-1)?.partialSelection).toBeUndefined();
  });

  it('picking a few of the stopped areas is a partial resume until Stop or a new Translate page press', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    finishAll(r);
    await flush();
    r.stop();
    await enterAndFire(r.d, ['p5']);
    expect(r.updates.at(-1)?.partialSelection).toBe(true);

    r.stop();
    expect(r.updates.at(-1)?.partialSelection).toBeUndefined();

    await enterAndFire(r.d, ['p6']);
    finishAll(r, 2);
    await flush();
    expect(r.updates.at(-1)?.partialSelection).toBe(true);
    await runWholePageTranslate(r.d);
    expect(r.updates.at(-1)?.partialSelection).toBeUndefined();
  });
});

describe('viewport band', () => {
  it('watches one viewport height above and below the screen', async () => {
    class Recording extends FakeObserver {
      static options: IntersectionObserverInit | undefined;
      constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super(cb);
        Recording.options = options;
      }
    }
    vi.stubGlobal('IntersectionObserver', Recording);
    page();
    await runWholePageTranslate(rig().d);
    expect(Recording.options).toEqual({ rootMargin: '100% 0px 100% 0px' });
  });

  it('blocks queued behind a full worker pool stay queued while others are reported outside the band', async () => {
    const els = page();
    const texts = els.map((e) => e.textContent);
    const r = rig(1);
    await runWholePageTranslate(r.d);
    band(els.slice(0, 3));
    await flush();
    expect(r.sent).toHaveLength(1);
    band(els.slice(1, 3));
    finishAll(r);
    await flush();
    finishAll(r, 1);
    await flush();
    finishAll(r, 2);
    await flush();
    expect(r.sent.map((s) => s.text)).toEqual(texts.slice(0, 3));
  });
});

describe('site switch', () => {
  it('turning Ega off with nothing queued does not stop a session that only waits for scroll', async () => {
    const els = page();
    const r = rig();
    let off = false;
    r.d.siteOff = () => off;
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    off = true;
    finishAll(r);
    await flush();
    expect(r.updates.at(-1)).toMatchObject({ settled: false, waiting: N - 2, skipped: 0 });
  });
});

describe('Stop', () => {
  it('drops a block that waits out a retry, so the session settles on what finished', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    routePageV2Chunk({ type: 'done', requestId: r.sent[0]?.id ?? '', text: 'T', confidence: 1 });
    fail(r, 1, 'NETWORK');
    await flush();
    expect(r.updates.at(-1)).toMatchObject({ inFlight: 1, done: 1 });
    r.stop();
    expect(r.updates.at(-1)).toMatchObject({ settled: true, done: 1, total: 1, skipped: N - 1 });
    expect(els[1]?.querySelector('[data-ega-replaced]')).toBeNull();
  });

  it('a retry that comes after Stop leaves the stopped session open, showing what it dropped', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 1));
    await flush();
    r.stop();
    fail(r, 0, 'NETWORK');
    await flush();
    expect(isPageV2Active()).toBe(true);
    expect(showToastMock).not.toHaveBeenCalled();
    expect(r.updates.at(-1)).toMatchObject({ settled: true, done: 0, total: 0, skipped: N });
  });
});

describe('a block the page removes', () => {
  it('a page that drops its waiting blocks settles the session on its own, after a short wait', async () => {
    vi.useFakeTimers();
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 1));
    await flush();
    finishAll(r);
    await flush();
    await vi.advanceTimersByTimeAsync(300);
    expect(r.updates.at(-1)).toMatchObject({ settled: false, total: N });

    for (const el of els.slice(1)) el.remove();
    await vi.advanceTimersByTimeAsync(300);
    expect(r.updates.at(-1)).toMatchObject({ settled: true, done: 1, total: 1 });
    expect(r.live.at(-1)).toBe('Page translated.');
  });

  it('a removal that comes in the same moment as an addition is still noticed', async () => {
    vi.useFakeTimers();
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 1));
    await flush();
    finishAll(r);
    await flush();
    await vi.advanceTimersByTimeAsync(300);

    document.body.append(document.createElement('div'));
    for (const el of els.slice(1)) el.remove();
    await vi.advanceTimersByTimeAsync(300);
    expect(r.updates.at(-1)).toMatchObject({ settled: true, total: 1 });
  });
});

describe('failures', () => {
  it('names a stalled block with the reason the pill lists', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<p id="a">これは一つだけの段落です。</p>';
    const r = rig();
    await runWholePageTranslate(r.d);
    band([document.getElementById('a') as HTMLElement]);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(r.updates.at(-1)?.failure?.details).toEqual(['No reply in time.']);
  });

  it('counts a block waiting out a retry as in flight', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    fail(r, 0, 'NETWORK');
    await flush();
    expect(r.updates.at(-1)).toMatchObject({ inFlight: 2 });
  });

  it('lists each different failure message once and none that is empty', async () => {
    const els = page();
    const r = rig(4);
    await runWholePageTranslate(r.d);
    band(els.slice(0, 4));
    await flush();
    fail(r, 0, 'UNKNOWN', { message: 'bad gateway' });
    fail(r, 1, 'UNKNOWN', { message: 'bad gateway' });
    fail(r, 2, 'UNKNOWN', { message: '' });
    fail(r, 3, 'UNKNOWN', { message: 'proxy down' });
    await flush();
    expect(r.updates.at(-1)?.failure?.details).toEqual(['bad gateway', 'proxy down']);
  });

  it('the pill names the failure most blocks share, not the first one', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 3));
    await flush();
    fail(r, 0, 'AUTH');
    fail(r, 1, 'UNKNOWN');
    fail(r, 2, 'UNKNOWN');
    await flush();
    const failure = r.updates.at(-1)?.failure;
    expect(failure?.actions[0]).not.toBe('open-settings');
    expect(failure?.settingsChanged).toBeUndefined();
  });

  it('the pill names the backend of the failed block', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 1));
    await flush();
    fail(r, 0, 'QUOTA', { backendId: 'anthropic' as BackendId });
    await flush();
    const label = backendLabel('anthropic' as BackendId);
    expect(r.updates.at(-1)?.failure?.body).toContain(label);
  });

  it('a failure code this build does not know still offers Try again with no catalog text', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 1));
    await flush();
    fail(r, 0, 'ABORTED');
    await flush();
    expect(r.updates.at(-1)?.failure).toMatchObject({ body: '', actions: ['try-again'] });
  });
});

describe('a settings change after a settings error', () => {
  it('turns only the settings errors into "Settings changed"; other failures keep their words', async () => {
    const els = page();
    const r = rig();
    const change = withSettingsChange(r);
    await runWholePageTranslate(r.d);
    band(els.slice(0, 3));
    await flush();
    fail(r, 0, 'AUTH');
    fail(r, 1, 'UNKNOWN');
    fail(r, 2, 'UNKNOWN');
    await flush();
    const unknownChip = chipText(els[1]);
    change();
    const failure = r.updates.at(-1)?.failure;
    expect(failure?.body).not.toBe(SETTINGS_CHANGED_BODY);
    expect(failure?.settingsChanged).toBeUndefined();
    expect(chipText(els[1])).toBe(unknownChip);
    expect(chipText(els[0])).toContain('Try again');
  });

  it('with every settings error changed the pill leads with Try again, once, then the other steps', async () => {
    const els = page();
    const r = rig();
    const change = withSettingsChange(r);
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    fail(r, 0, 'AUTH');
    fail(r, 1, 'AUTH');
    await flush();
    change();
    expect(r.updates.at(-1)?.failure).toMatchObject({
      body: SETTINGS_CHANGED_BODY,
      settingsChanged: true,
      actions: ['try-again', 'open-settings'],
    });
  });

  it('a settings error that came after the change is not "changed"', async () => {
    const els = page();
    const r = rig();
    const change = withSettingsChange(r);
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    fail(r, 0, 'AUTH');
    await flush();
    change();
    fail(r, 1, 'AUTH');
    await flush();
    const failure = r.updates.at(-1)?.failure;
    expect(failure?.settingsChanged).toBeUndefined();
    expect(failure?.actions[0]).toBe('open-settings');
  });
});

describe('a failed leading run', () => {
  it('Try again puts the translation back into the leading run', async () => {
    document.body.innerHTML =
      '<div id="c">これはコメントの最初の段落です。<p id="c2">これは二つ目の段落です。</p></div>';
    const r = rig();
    await runWholePageTranslate(r.d);
    band([document.getElementById('c'), document.getElementById('c2')] as HTMLElement[]);
    await flush();
    fail(r, 0, 'UNKNOWN');
    finishAll(r, 1);
    await flush();
    const button = document
      .querySelector('#c [data-ega-tx-error]')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-ega-retry-block]');
    button?.click();
    await flush();
    finishAll(r, 2);
    await flush();
    expect(document.querySelector('#c > [data-ega-replaced][data-ega-run]')?.textContent).toBe('T');
  });

  it('Try again sends the detected language of the block again', async () => {
    document.body.innerHTML = '<p id="a">Ceci est un paragraphe.</p>';
    const r = rig();
    r.d.detectLang = () => 'fr';
    await runWholePageTranslate(r.d);
    band([document.getElementById('a') as HTMLElement]);
    await flush();
    fail(r, 0, 'UNKNOWN');
    await flush();
    document
      .querySelector('[data-ega-tx-error]')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-ega-retry-block]')
      ?.click();
    await flush();
    const calls = (r.d.dispatch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.map((c) => c[2])).toEqual(['fr', 'fr']);
  });
});

describe('errors that need a setting stop the session', () => {
  it.each([
    ['AUTH', 'bad key'],
    ['QUOTA', 'no credit'],
    ['NO_BACKEND', 'none'],
    ['NATIVE_NOT_INSTALLED', 'missing'],
    ['NATIVE_SPAWN_FAIL', 'spawn'],
    ['NATIVE_CLI_CONFIG', 'config'],
    ['UNSUPPORTED', 'unsupported'],
    ['REQUEST', 'This backend does not know this model.'],
  ])('%s: the next block in view is not sent', async (code, message) => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 3));
    await flush();
    fail(r, 0, code, { message });
    await flush();
    band(els.slice(3, 7));
    await flush();
    expect(r.sent).toHaveLength(3);
  });

  it.each(['UNKNOWN', 'PARSE', 'SERVER'])(
    '%s: the next block in view is still sent',
    async (code) => {
      const els = page();
      const r = rig();
      await runWholePageTranslate(r.d);
      band(els.slice(0, 3));
      await flush();
      fail(r, 0, code, { message: 'no' });
      await flush();
      band(els.slice(3, 7));
      await flush();
      expect(r.sent.length).toBeGreaterThan(3);
    },
  );
});

describe('a block the page re-rendered while the session picks more areas', () => {
  it('keeps a block that is still being translated', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 1));
    await flush();
    (els[0] as HTMLElement).textContent = 'これは書き換えられた段落です。';
    await enterAndFire(r.d, ['p1']);
    expect(r.updates.at(-1)).toMatchObject({ total: 2, inFlight: 2 });
    finishAll(r);
    await flush();
    expect(r.updates.at(-1)).toMatchObject({ settled: true, done: 2, total: 2 });
  });

  it('keeps a block that failed, so its error still counts', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 1));
    await flush();
    fail(r, 0, 'UNKNOWN');
    await flush();
    (els[0] as HTMLElement).textContent = 'これは書き換えられた段落です。';
    await enterAndFire(r.d, ['p1']);
    expect(r.updates.at(-1)).toMatchObject({ total: 2, failed: 1 });
  });
});

describe('Show original, then another press', () => {
  it('the translation comes back and a click-and-hold on it shows the original again', async () => {
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
    await runWholePageTranslate(r.d);
    const wrapper = els[0]?.querySelector('[data-ega-replaced]') as HTMLElement;
    wrapper.dispatchEvent(new MouseEvent('mousedown'));
    expect(wrapper.hasAttribute('data-ega-peek')).toBe(true);
  });
});

describe('late events on a finished or removed session', () => {
  it('a second done for a block that already finished changes nothing', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 1));
    await flush();
    finishAll(r);
    await flush();
    const before = { updates: r.updates.length, live: r.live.length };
    routePageV2Chunk({ type: 'done', requestId: r.sent[0]?.id ?? '', text: 'T', confidence: 1 });
    await flush();
    expect({ updates: r.updates.length, live: r.live.length }).toEqual(before);
  });

  it('a send that fails after Remove translation shows nothing and reports nothing', async () => {
    const els = page();
    const r = rig();
    let rejectSend: (e: Error) => void = () => {};
    r.d.dispatch = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectSend = reject;
        }),
    );
    await runWholePageTranslate(r.d);
    band(els.slice(0, 1));
    await flush();
    await cancelPageTranslateV2();
    const updates = r.updates.length;
    rejectSend(new Error('socket closed'));
    await flush();
    expect(r.updates.length).toBe(updates);
    expect(document.querySelectorAll('[data-ega-tx-error]')).toHaveLength(0);
  });

  it('an observer entry that arrives after Remove translation sends nothing and reports nothing', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    const observer = FakeObserver.last as FakeObserver;
    await cancelPageTranslateV2();
    const updates = r.updates.length;
    observer.cb(
      [{ target: els[0], isIntersecting: true } as unknown as IntersectionObserverEntry],
      observer as unknown as IntersectionObserver,
    );
    await flush();
    expect(r.sent).toHaveLength(0);
    expect(r.updates.length).toBe(updates);
  });

  it('Stop on a session that already finished changes nothing', async () => {
    const els = page().slice(0, 1);
    for (let i = 1; i < N; i++) document.getElementById(`p${i}`)?.remove();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els);
    await flush();
    finishAll(r);
    await flush();
    expect(r.updates.at(-1)).toMatchObject({ settled: true });
    const updates = r.updates.length;
    r.stop();
    expect(r.updates.length).toBe(updates);
  });
});

describe('a settings stop parks the rest', () => {
  it('a block waiting out a retry is dropped without counting as stopped', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 2));
    await flush();
    fail(r, 1, 'NETWORK');
    fail(r, 0, 'AUTH');
    await flush();
    expect(r.updates.at(-1)).toMatchObject({ settled: true, skipped: 0, total: 1, failed: 1 });
  });

  it('choosing one of the parked areas does not take anything off the stopped count', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    band(els.slice(0, 1));
    await flush();
    fail(r, 0, 'AUTH');
    await flush();
    expect(r.updates.at(-1)).toMatchObject({ settled: true, skipped: 0 });
    await enterAndFire(r.d, ['p5']);
    expect(r.updates.at(-1)?.skipped).toBe(0);
  });
});
