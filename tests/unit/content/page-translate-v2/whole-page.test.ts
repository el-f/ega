// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  runWholePageTranslate,
  cancelPageTranslateV2,
  routePageV2Chunk,
  isPageV2Active,
} from '@/content/page-translate-v2';
import type { Settings } from '@/shared/types';
import { FakeObserver, finishAll, flush, rig } from '@tests/_helpers/page-translate';
import { looksLikeEnglish } from '@/content/looks-like-english';

const N = 12;
const text = (i: number): string => `これは${i}番目の段落です。`;
function page(): HTMLElement[] {
  document.body.innerHTML = Array.from(
    { length: N },
    (_, i) => `<p id="p${i}">これは${i}番目の段落です。</p>`,
  ).join('');
  return Array.from({ length: N }, (_, i) => document.getElementById(`p${i}`) as HTMLElement);
}

beforeEach(async () => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  await cancelPageTranslateV2();
});

afterEach(async () => {
  await cancelPageTranslateV2();
  vi.unstubAllGlobals();
});

describe('whole-page translate', () => {
  it('sends nothing until blocks come near, then the near ones top to bottom', async () => {
    const els = page();
    const r = rig();
    expect(await runWholePageTranslate(r.d)).toBe(true);
    expect(r.sent).toHaveLength(0);
    expect(r.updates.at(-1)).toMatchObject({ total: N, waiting: N });

    FakeObserver.last?.band(new Set([els[2], els[0], els[1]] as HTMLElement[]));
    await flush();
    expect(r.sent.map((s) => s.text)).toEqual([text(0), text(1), text(2)]);
  });

  it('goes idle with the rest waiting for scroll, and starts them when they come near', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    FakeObserver.last?.band(new Set(els.slice(0, 2)));
    await flush();
    finishAll(r);
    await flush();
    expect(r.updates.at(-1)).toMatchObject({
      done: 2,
      inFlight: 0,
      waiting: N - 2,
      settled: false,
    });

    FakeObserver.last?.band(new Set(els.slice(2, 4)));
    await flush();
    expect(r.sent).toHaveLength(4);
  });

  it('a queued block that leaves the band goes back to waiting and is never mounted', async () => {
    const els = page();
    const r = rig(1);
    await runWholePageTranslate(r.d);
    FakeObserver.last?.band(new Set(els.slice(0, 3)));
    await flush();
    // One slot: p0 in flight, p1 and p2 queued. A scrollbar drag moves the band past them.
    expect(r.sent).toHaveLength(1);
    FakeObserver.last?.band(new Set(els.slice(8, 9)));
    finishAll(r);
    await flush();
    expect(r.sent.map((s) => s.text)).toEqual([text(0), text(8)]);
    expect(els[1]?.querySelector('[data-ega-replaced]')).toBeNull();
  });

  it('drops a block already in the target language from the count', async () => {
    const els = page();
    const r = rig();
    r.d.isTargetLanguage = (t) => t.includes('1番目');
    await runWholePageTranslate(r.d);
    FakeObserver.last?.band(new Set(els.slice(0, 3)));
    await flush();
    expect(r.sent.map((s) => s.text)).toEqual([text(0), text(2)]);
    expect(r.updates.at(-1)?.total).toBe(N - 1);
  });

  it('skips English text on an English target, and never reads other scripts as English', async () => {
    document.body.innerHTML =
      '<p id="e">The quick brown fox jumps over the lazy dog every morning.</p><p id="j">これは日本語の段落です。</p>';
    const r = rig();
    delete r.d.isTargetLanguage;
    r.d.target = 'en';
    r.d.looksLikeEnglish = looksLikeEnglish;
    await runWholePageTranslate(r.d);
    FakeObserver.last?.band(new Set([...document.querySelectorAll('p')]));
    await flush();
    expect(r.sent.map((s) => s.text)).toEqual(['これは日本語の段落です。']);
    expect(r.updates.at(-1)?.total).toBe(1);
  });

  it('Stop drops what is still waiting and settles on what finished', async () => {
    const els = page();
    const r = rig();
    await runWholePageTranslate(r.d);
    FakeObserver.last?.band(new Set(els.slice(0, 2)));
    await flush();
    r.stop();
    finishAll(r);
    await flush();
    expect(r.updates.at(-1)).toMatchObject({ settled: true, done: 2, total: 2, skipped: N - 2 });
    expect(r.sent).toHaveLength(2);
  });

  it('Remove translation puts the page back exactly as it was', async () => {
    const els = page();
    const before = document.body.innerHTML;
    const r = rig();
    await runWholePageTranslate(r.d);
    FakeObserver.last?.band(new Set(els.slice(0, 5)));
    await flush();
    finishAll(r);
    await flush();
    expect(document.body.innerHTML).not.toBe(before);

    await cancelPageTranslateV2();
    expect(document.body.innerHTML).toBe(before);
    expect(isPageV2Active()).toBe(false);
  });

  it('says so when the page has nothing to translate', async () => {
    document.body.innerHTML = '<p>42</p><pre>code only</pre>';
    expect(await runWholePageTranslate(rig().d)).toBe(false);
    expect(isPageV2Active()).toBe(false);
  });

  it('turning Ega off on the site stops the session before its next send', async () => {
    const els = page();
    const r = rig();
    let off = false;
    let changed: (() => void) | undefined;
    r.d.siteOff = () => off;
    r.d.onSettingsChange = (fn) => {
      changed = fn;
      return () => (changed = undefined);
    };
    await runWholePageTranslate(r.d);
    FakeObserver.last?.band(new Set(els.slice(0, 2)));
    await flush();
    expect(r.sent).toHaveLength(2);

    off = true;
    changed?.();
    FakeObserver.last?.band(new Set(els.slice(2, 6)));
    await flush();
    expect(r.sent).toHaveLength(2);
    expect(r.updates.at(-1)?.waiting).toBe(0);
  });

  it('checks the site switch before every send, even before the settings update arrives', async () => {
    const els = page();
    const r = rig();
    let off = false;
    r.d.siteOff = () => off;
    await runWholePageTranslate(r.d);
    FakeObserver.last?.band(new Set(els.slice(0, 2)));
    await flush();
    off = true;
    FakeObserver.last?.band(new Set(els.slice(2, 6)));
    await flush();
    expect(r.sent).toHaveLength(2);
  });

  it('sends only the text a reader sees: never a skipped field, hidden part or code', async () => {
    document.body.innerHTML = `<p id="p">Cuenta: <span data-ega-skip>IBAN ES91 0000</span> <span class="notranslate">git</span> <span contenteditable="true">borrador</span> listo para pagar</p>`;
    const r = rig();
    await runWholePageTranslate(r.d);
    FakeObserver.last?.band(new Set([document.getElementById('p') as HTMLElement]));
    await flush();
    expect(r.sent.map((s) => s.text)).toEqual(['Cuenta: listo para pagar']);
  });

  it('Replace text never flattens a link or a field: such a block shows in Show both', async () => {
    document.body.innerHTML = `<p id="link">Visita <a href="#">nuestra página</a> hoy mismo</p><p id="plain">Texto simple aquí</p>`;
    const r = rig();
    await runWholePageTranslate(r.d);
    FakeObserver.last?.band(new Set([...document.querySelectorAll('p')]));
    await flush();
    finishAll(r);
    await flush();
    const link = document.getElementById('link') as HTMLElement;
    expect(link.querySelector('a')).not.toBeNull();
    expect(link.nextElementSibling?.hasAttribute('data-ega-tx')).toBe(true);
    expect(document.getElementById('plain')?.querySelector('[data-ega-replaced]')).not.toBeNull();
  });

  it('Show both puts a cell or list item translation inside it, so rows and lists keep their shape', async () => {
    document.body.innerHTML = `<table><tr id="row"><td id="c">Celda de texto</td><td>42</td></tr></table><ol><li id="li">Primer paso</li></ol>`;
    const r = rig();
    r.d.getSettings = () =>
      Promise.resolve({ pageTranslateMode: 'bilingual', batchConcurrency: 3 } as Settings);
    await runWholePageTranslate(r.d);
    FakeObserver.last?.band(
      new Set([document.getElementById('c'), document.getElementById('li')] as HTMLElement[]),
    );
    await flush();
    finishAll(r);
    await flush();
    expect(document.getElementById('row')?.children).toHaveLength(2);
    expect(document.getElementById('c')?.querySelector(':scope > [data-ega-tx]')).not.toBeNull();
    expect(document.querySelectorAll('ol > li')).toHaveLength(1);
  });

  it('a block that failed before is sent again by a new session, without its old chip', async () => {
    document.body.innerHTML = `<p id="p">Un párrafo que falló</p>`;
    const p = document.getElementById('p') as HTMLElement;
    const first = rig();
    await runWholePageTranslate(first.d);
    FakeObserver.last?.band(new Set([p]));
    await flush();
    routePageV2Chunk({
      type: 'error',
      requestId: first.sent[0]?.id ?? '',
      code: 'AUTH',
      message: 'bad key',
    });
    await flush();
    first.close();
    expect(p.querySelector('[data-ega-tx-error]')).not.toBeNull();

    const second = rig();
    await runWholePageTranslate(second.d);
    FakeObserver.last?.band(new Set([p]));
    await flush();
    expect(second.sent.map((s) => s.text)).toEqual(['Un párrafo que falló']);
    expect(p.querySelectorAll('[data-ega-tx-error]')).toHaveLength(0);
  });

  it('never sends a block twice and only sends blocks that were near, on any scroll path', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.oneof(
            fc.record({ kind: fc.constant('band' as const), at: fc.nat({ max: N - 1 }) }),
            fc.record({ kind: fc.constant('finish' as const) }),
          ),
          { maxLength: 12 },
        ),
        async (steps) => {
          await cancelPageTranslateV2();
          const els = page();
          const r = rig(2);
          await runWholePageTranslate(r.d);
          const everNear = new Set<string>();
          let finished = 0;
          for (const step of steps) {
            if (step.kind === 'band') {
              const near = new Set(els.slice(step.at, step.at + 3));
              for (let i = step.at; i < Math.min(N, step.at + 3); i++) everNear.add(text(i));
              FakeObserver.last?.band(near);
            } else {
              finishAll(r, finished);
              finished = r.sent.length;
            }
            await flush();
          }
          const texts = r.sent.map((s) => s.text);
          expect(new Set(texts).size).toBe(texts.length);
          for (const t of texts) expect(everNear.has(t)).toBe(true);
        },
      ),
      { numRuns: 40 },
    );
  });
});
