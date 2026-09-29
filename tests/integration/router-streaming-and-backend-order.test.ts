import { describe, it, expect, vi } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter, type RouterDeps } from '@/background/router';
import type { TranslateCallArgs, TranslationBackend } from '@/shared/backends/base';
import type { Settings, TranslationChunk } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

/** Seventh router mutation-kill batch: the delta-buffer wrapper (L114-149) and
 *  backend order resolution (L187-218) of src/background/router.ts. */

const bid = (s: string) => asBackendIdUnsafe(s);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const REQ = {
  id: 'r1',
  text: 'hi',
  sourceLang: sel('arabizi'),
  targetLang: sel('en'),
  options: { stream: true, explain: false },
};

const okTranslate = async ({ req, onChunk }: TranslateCallArgs): Promise<void> => {
  onChunk({ type: 'delta', requestId: req.id, text: 'ok' });
  onChunk({ type: 'done', requestId: req.id, confidence: 1 });
};

const failTranslate = async ({ req, onChunk }: TranslateCallArgs): Promise<void> => {
  onChunk({ type: 'error', requestId: req.id, code: 'NETWORK', message: 'conn reset' });
};

function stub(
  id: string,
  opts: {
    vision?: boolean;
    translate?: (a: TranslateCallArgs) => Promise<void>;
    translateImage?: NonNullable<TranslationBackend['translateImage']>;
  } = {},
) {
  const isAvailable = vi.fn(async () => true);
  const translate = vi.fn<(a: TranslateCallArgs) => Promise<void>>(opts.translate ?? okTranslate);
  const backend: TranslationBackend = {
    id: bid(id),
    manifest: testManifest(id, opts.vision ?? false),
    isAvailable,
    translate,
  };
  if (opts.translateImage) backend.translateImage = opts.translateImage;
  return { backend, isAvailable, translate };
}

function mkSettings(patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    disabledBackends: [],
    taskBackends: {},
    cacheEnabled: false,
    ...patch,
  };
}

function baseDeps(backends: TranslationBackend[], settings: Settings): RouterDeps {
  return {
    backends,
    getSettings: async () => settings,
    cache: { get: async () => undefined, set: async () => {} },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };
}

const deltaTexts = (cs: TranslationChunk[]): string[] =>
  cs.flatMap((c) => (c.type === 'delta' ? [c.text] : []));

describe('router — streaming flush wrapper', () => {
  async function runWithFlush(flushMs: number, texts: string[]): Promise<TranslationChunk[]> {
    const a = stub('b1', {
      translate: async ({ req, onChunk }) => {
        for (const t of texts) onChunk({ type: 'delta', requestId: req.id, text: t });
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    });
    const s = mkSettings({ backendOrder: [bid('b1')], streamingFlushMs: flushMs });
    const chunks: TranslationChunk[] = [];
    await createRouter(baseDeps([a.backend], s)).handleTranslate(REQ, (c) => chunks.push(c));
    return chunks;
  }

  it('flushMs>0 merges consecutive deltas into ONE chunk drained before the terminal', async () => {
    const chunks = await runWithFlush(50, ['al', 'pha', '!']);
    expect(deltaTexts(chunks)).toEqual(['alpha!']);
    const types = chunks.map((c) => c.type);
    expect(types.indexOf('delta')).toBeLessThan(types.indexOf('done'));
    expect(types.filter((t) => t === 'done')).toHaveLength(1);
  });

  it('flushMs=0 forwards every delta verbatim (pass-through, no buffering)', async () => {
    const chunks = await runWithFlush(0, ['al', 'pha', '!']);
    expect(deltaTexts(chunks)).toEqual(['al', 'pha', '!']);
  });

  it('a buffered delta auto-flushes after flushMs and the timer re-arms for the next one', async () => {
    const seen: TranslationChunk[] = [];
    const snaps: string[][] = [];
    const a = stub('b1', {
      translate: async ({ req, onChunk }) => {
        onChunk({ type: 'delta', requestId: req.id, text: 'one' });
        await sleep(60);
        snaps.push(deltaTexts(seen));
        onChunk({ type: 'delta', requestId: req.id, text: 'two' });
        await sleep(60);
        snaps.push(deltaTexts(seen));
        onChunk({ type: 'done', requestId: req.id, confidence: 1 });
      },
    });
    const s = mkSettings({ backendOrder: [bid('b1')], streamingFlushMs: 20 });
    await createRouter(baseDeps([a.backend], s)).handleTranslate(REQ, (c) => seen.push(c));
    expect(snaps).toEqual([['one'], ['one', 'two']]);
    expect(deltaTexts(seen)).toEqual(['one', 'two']);
  });
});

describe('router — probe window', () => {
  it('text path probes only the first max(3, maxAttempts) backends', async () => {
    const bs = ['b1', 'b2', 'b3', 'b4', 'b5'].map((id) => stub(id));
    const s = mkSettings({
      backendOrder: bs.map((b) => b.backend.id),
      advanced: { ...DEFAULT_SETTINGS.advanced, retryCount: 1 },
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(
      baseDeps(
        bs.map((b) => b.backend),
        s,
      ),
    ).handleTranslate(REQ, (c) => chunks.push(c));
    expect(bs.slice(0, 3).map((b) => b.isAvailable.mock.calls.length)).toEqual([1, 1, 1]);
    expect(bs[3]?.isAvailable).not.toHaveBeenCalled();
    expect(bs[4]?.isAvailable).not.toHaveBeenCalled();
    expect(chunks.find((c) => c.type === 'done')).toBeTruthy();
  });

  it('image path walks the whole order to reach a vision backend past the third slot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array(100), {
            status: 200,
            headers: { 'content-type': 'image/png' },
          }),
      ),
    );
    const imgSpy = vi.fn<NonNullable<TranslationBackend['translateImage']>>(async (a) => {
      a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
    });
    const blind = ['n1', 'n2', 'n3', 'n4'].map((id) => stub(id));
    const v5 = stub('v5', { vision: true, translateImage: imgSpy });
    const s = mkSettings({
      backendOrder: [...blind.map((b) => b.backend.id), v5.backend.id],
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(
      baseDeps([...blind.map((b) => b.backend), v5.backend], s),
    ).handleImageTranslate({ id: 'img-1', imageUrl: 'https://example.com/ok.png' }, (c) =>
      chunks.push(c),
    );
    expect(v5.isAvailable).toHaveBeenCalledTimes(1);
    expect(imgSpy).toHaveBeenCalledTimes(1);
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

describe('router — task chain and pin hoist', () => {
  it('task chain beats backendOrder and drops disabled + unregistered ids', async () => {
    const first = stub('order-first');
    const off = stub('turned-off');
    const good = stub('good');
    const s = mkSettings({
      backendOrder: [first.backend.id, off.backend.id, good.backend.id],
      disabledBackends: [off.backend.id],
      advanced: {
        ...DEFAULT_SETTINGS.advanced,
        taskBackendChains: { translate: [off.backend.id, bid('ghost'), good.backend.id] },
      },
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(baseDeps([first.backend, off.backend, good.backend], s)).handleTranslate(
      REQ,
      (c) => chunks.push(c),
    );
    expect(good.translate).toHaveBeenCalledTimes(1);
    expect(off.translate).not.toHaveBeenCalled();
    expect(first.translate).not.toHaveBeenCalled();
    expect(chunks.find((c) => c.type === 'done')).toBeTruthy();
  });

  it('pinned backend runs first and appears once — the rest of the order follows', async () => {
    const order: string[] = [];
    const trace =
      (id: string, impl: (a: TranslateCallArgs) => Promise<void>) =>
      async (a: TranslateCallArgs) => {
        order.push(id);
        await impl(a);
      };
    const pin = stub('pin', { translate: trace('pin', failTranslate) });
    const a = stub('a', { translate: trace('a', failTranslate) });
    const z = stub('z', { translate: trace('z', okTranslate) });
    const s = mkSettings({
      backendOrder: [a.backend.id, pin.backend.id, z.backend.id],
      taskBackends: { translate: pin.backend.id },
      advanced: { ...DEFAULT_SETTINGS.advanced, retryCount: 3 },
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(baseDeps([a.backend, pin.backend, z.backend], s)).handleTranslate(REQ, (c) =>
      chunks.push(c),
    );
    expect(order).toEqual(['pin', 'a', 'z']);
    expect(pin.translate).toHaveBeenCalledTimes(1);
    expect(chunks.find((c) => c.type === 'done')).toBeTruthy();
  });

  it('a pinned backend without vision is not hoisted into the image chain', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array(100), {
            status: 200,
            headers: { 'content-type': 'image/png' },
          }),
      ),
    );
    const imgSpy = vi.fn<NonNullable<TranslationBackend['translateImage']>>(async (a) => {
      a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
    });
    const nv = stub('no-vision');
    const vis = stub('vision', { vision: true, translateImage: imgSpy });
    const s = mkSettings({
      backendOrder: [nv.backend.id, vis.backend.id],
      taskBackends: { translate: nv.backend.id },
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(baseDeps([nv.backend, vis.backend], s)).handleImageTranslate(
      { id: 'img-2', imageUrl: 'https://example.com/ok.png' },
      (c) => chunks.push(c),
    );
    expect(imgSpy).toHaveBeenCalledTimes(1);
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
    expect(chunks.find((c) => c.type === 'done')).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
