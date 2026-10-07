// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  runWholePageTranslate,
  cancelPageTranslateV2,
  routePageV2Chunk,
  isPageV2Active,
  type ProgressHandle,
} from '@/content/page-translate-v2';
import type { PageProgress } from '@/content/page-translate-v2/progress';
import { deps, flush } from '@tests/_helpers/page-translate';
import { looksLikeEnglish } from '@/content/looks-like-english';

/** A stand-in for the viewport band: the test says which blocks are near. */
class FakeObserver {
  static last: FakeObserver | null = null;
  readonly observed = new Set<Element>();
  constructor(readonly cb: IntersectionObserverCallback) {
    FakeObserver.last = this;
  }
  observe(el: Element): void {
    this.observed.add(el);
  }
  unobserve(el: Element): void {
    this.observed.delete(el);
  }
  disconnect(): void {
    this.observed.clear();
  }
  /** One callback with an entry for every observed block, near or not. */
  band(near: Set<Element>): void {
    const entries = [...this.observed].map(
      (target) => ({ target, isIntersecting: near.has(target) }) as IntersectionObserverEntry,
    );
    this.cb(entries, this as unknown as IntersectionObserver);
  }
}

const N = 12;
const text = (i: number): string => `これは${i}番目の段落です。`;
function page(): HTMLElement[] {
  document.body.innerHTML = Array.from(
    { length: N },
    (_, i) => `<p id="p${i}">これは${i}番目の段落です。</p>`,
  ).join('');
  return Array.from({ length: N }, (_, i) => document.getElementById(`p${i}`) as HTMLElement);
}

function rig(concurrency = 3): {
  sent: { id: string; text: string }[];
  updates: PageProgress[];
  handle: ProgressHandle;
  stop: () => void;
  d: ReturnType<typeof deps>;
} {
  const sent: { id: string; text: string }[] = [];
  const updates: PageProgress[] = [];
  const out = { sent, updates, stop: () => {} } as ReturnType<typeof rig>;
  out.handle = {
    update: (p) => updates.push(p),
    setLiveMessage: vi.fn(),
    setOnClose: vi.fn(),
    setOnUndoAll: vi.fn(),
    dismiss: vi.fn(),
  };
  out.d = deps(
    {
      dispatch: vi.fn((id: string, text: string) => {
        sent.push({ id, text });
        return Promise.resolve();
      }),
      mountProgress: (_total, onStop) => {
        out.stop = onStop;
        return out.handle;
      },
      isTargetLanguage: () => false,
    },
    { batchConcurrency: concurrency },
  );
  return out;
}

function finishAll(r: ReturnType<typeof rig>, from = 0): void {
  for (const s of r.sent.slice(from)) {
    routePageV2Chunk({ type: 'delta', requestId: s.id, text: '{"translation":"T"}' });
    routePageV2Chunk({ type: 'done', requestId: s.id, confidence: 1 });
  }
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
