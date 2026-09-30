import { describe, it, expect, vi } from 'vitest';
import { createRouter } from '@/background/router';
import type { TranslationBackend, TranslateCallArgs } from '@/shared/backends/base';
import type { Settings, TranslationChunk } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe, asLangIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { baseDeps, mkSettings as mkRouterSettings } from '@tests/_helpers/router';

const bid = (s: string) => asBackendIdUnsafe(s);

function mkBackend(
  id: string,
  translate: (a: TranslateCallArgs) => Promise<void>,
  available = true,
): TranslationBackend {
  return {
    id: bid(id),
    manifest: testManifest(id),
    isAvailable: async () => available,
    translate,
  };
}

function mkSettings(patch: Partial<Settings> = {}): Settings {
  return mkRouterSettings({ backendOrder: [bid('a'), bid('b'), bid('c'), bid('d')], ...patch });
}

describe('router probe quota counts results, not candidates', () => {
  it('reaches the only configured backend when it sits at index 4', async () => {
    const probed: string[] = [];
    const mkDead = (id: string): TranslationBackend => {
      const b = mkBackend(id, async () => {}, false);
      return { ...b, isAvailable: async () => (probed.push(id), false) };
    };
    const live = mkBackend('e', async ({ req, onChunk }) => {
      onChunk({ type: 'delta', requestId: req.id, text: '{"translation":"ok","confidence":0.9}' });
      onChunk({ type: 'done', requestId: req.id, confidence: 0.9 });
    });
    const backends = [
      mkDead('a'),
      mkDead('b'),
      mkDead('c'),
      mkDead('d'),
      { ...live, isAvailable: async () => (probed.push('e'), true) },
    ];
    const settings = mkSettings({
      backendOrder: [bid('a'), bid('b'), bid('c'), bid('d'), bid('e')],
    });
    const router = createRouter(baseDeps({ backends, getSettings: async () => settings }));

    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'r-quota',
        text: 'hello',
        sourceLang: 'auto',
        targetLang: asLangIdUnsafe('en'),
        options: { stream: false, explain: false },
      },
      (c) => chunks.push(c),
    );

    expect(probed).toContain('e');
    expect(chunks.find((c) => c.type === 'done')).toBeDefined();
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
  });

  it('stops probing once the quota is filled — a healthy head leaves the tail untouched', async () => {
    const probed: string[] = [];
    const mkOk = (id: string): TranslationBackend => {
      const b = mkBackend(id, async ({ req, onChunk }) => {
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: '{"translation":"ok","confidence":0.9}',
        });
        onChunk({ type: 'done', requestId: req.id, confidence: 0.9 });
      });
      return { ...b, isAvailable: async () => (probed.push(id), true) };
    };
    const backends = ['a', 'b', 'c', 'd', 'e'].map(mkOk);
    const settings = mkSettings({
      backendOrder: [bid('a'), bid('b'), bid('c'), bid('d'), bid('e')],
    });
    await createRouter(baseDeps({ backends, getSettings: async () => settings })).handleTranslate(
      {
        id: 'r-quota-2',
        text: 'hello',
        sourceLang: 'auto',
        targetLang: asLangIdUnsafe('en'),
        options: { stream: false, explain: false },
      },
      vi.fn(),
    );

    expect(probed).toEqual(['a', 'b', 'c']);
  });
});

describe('router probeLimit = maxAttempts', () => {
  it('4-backend chain at retryCount=3 includes the 4th backend in probe candidates', async () => {
    const called = new Set<string>();
    const makeTransient = (id: string): TranslationBackend =>
      mkBackend(id, async ({ req, onChunk }) => {
        called.add(id);
        onChunk({ type: 'error', requestId: req.id, code: 'NETWORK', message: 'transient' });
      });
    const makeOk = (id: string): TranslationBackend =>
      mkBackend(id, async ({ req, onChunk }) => {
        called.add(id);
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: '{"translation":"ok","confidence":0.9}',
        });
        onChunk({ type: 'done', requestId: req.id, confidence: 0.9 });
      });

    // a, b, c are transient; d succeeds. With retryCount=3 (maxAttempts=4)
    // the probe window must include d so it's available as the 4th attempt.
    const backends = [makeTransient('a'), makeTransient('b'), makeTransient('c'), makeOk('d')];
    const settings = mkSettings({ advanced: { ...DEFAULT_SETTINGS.advanced, retryCount: 3 } });
    const router = createRouter(baseDeps({ backends, getSettings: async () => settings }));

    const chunks: TranslationChunk[] = [];
    await router.handleTranslate(
      {
        id: 'r1',
        text: 'hello',
        sourceLang: 'auto',
        targetLang: asLangIdUnsafe('en'),
        options: { stream: false, explain: false },
      },
      (c) => chunks.push(c),
    );

    expect(called.has('d'), 'd must be probed and reached as 4th attempt').toBe(true);
    const done = chunks.find((c) => c.type === 'done');
    expect(done).toBeDefined();
  });

  it('retryCount=0 (maxAttempts=1) limits probe to first backend only', async () => {
    const called = new Set<string>();
    const makeOk = (id: string): TranslationBackend =>
      mkBackend(id, async ({ req, onChunk }) => {
        called.add(id);
        onChunk({
          type: 'delta',
          requestId: req.id,
          text: '{"translation":"ok","confidence":0.9}',
        });
        onChunk({ type: 'done', requestId: req.id, confidence: 0.9 });
      });

    const backends = [makeOk('a'), makeOk('b'), makeOk('c')];
    const settings = mkSettings({ advanced: { ...DEFAULT_SETTINGS.advanced, retryCount: 0 } });
    const router = createRouter(baseDeps({ backends, getSettings: async () => settings }));

    await router.handleTranslate(
      {
        id: 'r2',
        text: 'hello',
        sourceLang: 'auto',
        targetLang: asLangIdUnsafe('en'),
        options: { stream: false, explain: false },
      },
      vi.fn(),
    );

    expect(called.has('a')).toBe(true);
    expect(called.has('b'), 'b must NOT be probed when retryCount=0').toBe(false);
  });
});

describe('the image chain probes without the text limit', () => {
  it('reaches a vision backend past the position a text request would stop at', async () => {
    const probed = new Set<string>();
    const vision = (id: string, canVision: boolean): TranslationBackend => ({
      id: bid(id),
      manifest: testManifest(id, canVision),
      isAvailable: async () => {
        probed.add(id);
        return canVision;
      },
      translate: async () => {},
      ...(canVision
        ? {
            translateImage: async (a: {
              requestId: string;
              onChunk: (c: TranslationChunk) => void;
            }) => {
              a.onChunk({ type: 'delta', requestId: a.requestId, text: '{"translation":"OCR"}' });
              a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
            },
          }
        : {}),
    });

    // Only the fifth backend can see; a text request would have stopped probing well before it.
    const backends = [
      vision('a', false),
      vision('b', false),
      vision('c', false),
      vision('d', false),
      vision('e', true),
    ];
    const settings = mkSettings({
      backendOrder: ['a', 'b', 'c', 'd', 'e'].map(bid),
      advanced: { ...DEFAULT_SETTINGS.advanced, retryCount: 0 },
    });
    const router = createRouter(baseDeps({ backends, getSettings: async () => settings }));
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([137, 80, 78, 71]), {
            status: 200,
            headers: { 'content-type': 'image/png' },
          }),
      ),
    );
    const chunks: TranslationChunk[] = [];

    await router.handleImageTranslate(
      { id: 'img-far', imageUrl: 'https://example.com/pic.png' },
      (c) => chunks.push(c),
    );
    vi.unstubAllGlobals();

    expect(probed.has('e')).toBe(true);
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });
});
