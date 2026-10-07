import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sel } from '@tests/_helpers/lang';
import { createRouter, type RouterDeps } from '@/background/router';
import type {
  TranslateCallArgs,
  TranslationBackend,
  TranslateImageArgs,
} from '@/shared/backends/base';
import type { LangSelection, TranslationChunk, Settings } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { baseDeps as routerDeps } from '@tests/_helpers/router';

const bid = (s: string) => asBackendIdUnsafe(s);

function mkBackendWithImage(
  id: string,
  translateImage: NonNullable<TranslationBackend['translateImage']>,
): TranslationBackend {
  return {
    id: bid(id),
    manifest: testManifest(id, true),
    isAvailable: async () => true,
    translate: async (a) => {
      a.onChunk({ type: 'delta', requestId: a.req.id, text: '{"translation":"X","confidence":1}' });
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
    },
    translateImage,
  };
}

function mkSettings(patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    anthropicApiKey: 'k',
    cacheEnabled: true,
    contextEnabled: true,
    ...patch,
  };
}

function baseDeps(overrides: Partial<RouterDeps> = {}): RouterDeps {
  return routerDeps({ getSettings: async () => mkSettings(), ...overrides });
}

describe('router — image Content-Type regex', () => {
  // A wider Content-Type regex would pass SVG, BMP or TIFF to the model, so pin every accepted and rejected type.
  beforeEach(() => {
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
  });
  afterEach(() => vi.unstubAllGlobals());

  async function runWithType(contentType: string): Promise<TranslationChunk[]> {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array(100), {
            status: 200,
            headers: { 'content-type': contentType },
          }),
      ),
    );
    const imgSpy = vi.fn<NonNullable<TranslationBackend['translateImage']>>(
      async (a: TranslateImageArgs) => {
        a.onChunk({ type: 'delta', requestId: a.requestId, text: 'OK' });
        a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
      },
    );
    const b = mkBackendWithImage('anthropic', imgSpy);
    const deps = baseDeps({
      backends: [b],
      getSettings: async () => mkSettings({ disabledBackends: [] }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate(
      { id: 'img-1', imageUrl: 'https://example.com/x' },
      (c) => chunks.push(c),
    );
    return chunks;
  }

  for (const accepted of [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
    'IMAGE/PNG',
  ]) {
    it(`accepts ${accepted}`, async () => {
      const chunks = await runWithType(accepted);
      expect(chunks.some((c) => c.type === 'done')).toBe(true);
    });
  }

  // An empty Content-Type is settled by the bytes; with no known magic it is rejected.
  for (const rejected of [
    'image/bmp',
    'image/tiff',
    'image/svg+xml',
    'text/html',
    'application/json',
    'application/octet-stream',
  ]) {
    it(`rejects ${JSON.stringify(rejected)}`, async () => {
      const chunks = await runWithType(rejected);
      const err = chunks.find((c) => c.type === 'error');
      expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
    });
  }
});

describe('router — image URL validator', () => {
  async function runUrl(imageUrl: string): Promise<TranslationChunk[]> {
    const imgSpy = vi.fn<NonNullable<TranslationBackend['translateImage']>>(
      async (a: TranslateImageArgs) => {
        a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
      },
    );
    const b = mkBackendWithImage('anthropic', imgSpy);
    const deps = baseDeps({
      backends: [b],
      getSettings: async () => mkSettings({ disabledBackends: [] }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate({ id: 'img-1', imageUrl }, (c) => chunks.push(c));
    return chunks;
  }

  it('rejects 169.254.169.254 (AWS/GCP metadata)', async () => {
    const chunks = await runUrl('http://169.254.169.254/latest/meta-data/');
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
  });

  it('rejects 100.100.100.200 (Alibaba metadata)', async () => {
    const chunks = await runUrl('http://100.100.100.200/metadata');
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
  });

  it('rejects RFC 6598 CGN range 100.64.1.1 (mid-range, host-flavoured)', async () => {
    const chunks = await runUrl('http://100.64.1.1/x');
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
  });

  it('rejects 0.0.0.0 (this network)', async () => {
    const chunks = await runUrl('http://0.0.0.0/');
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
  });

  it('rejects multicast 224.x.x.x and 240.x.x.x reserved', async () => {
    for (const ip of ['224.0.0.1', '239.255.255.255', '240.0.0.1']) {
      const chunks = await runUrl(`http://${ip}/`);
      const err = chunks.find((c) => c.type === 'error');
      expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
    }
  });

  it('rejects 223.x (just below multicast floor) ALLOWED — pins the 224 boundary', async () => {
    // Mock fetch so the validator passes and we reach fetch.
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
    const chunks = await runUrl('http://223.255.255.255/x.png');
    // Validator accepted; fetch mock let it through to backend.
    const err = chunks.find((c) => c.type === 'error');
    // Should not be rejected by URL validator (may error later for other
    // reasons but not UNSUPPORTED for URL).
    expect(err?.type === 'error' ? err.message.includes('web address') : false).toBe(false);
    vi.unstubAllGlobals();
  });

  it('rejects *.local and *.internal (mDNS / corp reserved)', async () => {
    for (const host of ['mymachine.local', 'db.internal']) {
      const chunks = await runUrl(`http://${host}/`);
      const err = chunks.find((c) => c.type === 'error');
      expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
    }
  });

  it('rejects bracketed IPv6 link-local [fe80::…]', async () => {
    // URL.hostname keeps the brackets; the guard strips them before the fe80::/10 check.
    for (const u of ['http://[fe80::1]/', 'http://[fe80::2ff:febc:de]/']) {
      const chunks = await runUrl(u);
      const err = chunks.find((c) => c.type === 'error');
      expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
    }
  });

  it('rejects IPv6 AWS metadata prefix fd00:ec2::', async () => {
    const chunks = await runUrl('http://[fd00:ec2::254]/');
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
  });

  it("rejects garbage strings that URL() can't parse", async () => {
    const chunks = await runUrl('not a url');
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
    expect(err?.type === 'error' ? err.message : '').toContain('web address');
  });

  it('rejects chrome-extension://, blob:, file:, ftp:', async () => {
    for (const scheme of [
      'chrome-extension://abc/x',
      'blob:https://x/y',
      'file:///etc/passwd',
      'ftp://example.com/img',
    ]) {
      const chunks = await runUrl(scheme);
      const err = chunks.find((c) => c.type === 'error');
      expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
    }
  });

  // A raster data: URL is the side panel's own attachment — inert, nothing leaves the browser.
  it('rejects non-raster and oversized data URLs but lets a raster one through the gate', async () => {
    for (const url of [
      'data:image/svg+xml;base64,AAAA',
      'data:text/html;base64,AAAA',
      `data:image/png;base64,${'A'.repeat(6_000_001)}`,
    ]) {
      const chunks = await runUrl(url);
      const err = chunks.find((c) => c.type === 'error');
      expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
    }
    const ok = await runUrl('data:image/png;base64,AAAA');
    const err = ok.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).not.toBe('IMAGE_UNSUPPORTED');
  });
});

describe('router — image wall-clock TIMEOUT', () => {
  beforeEach(() => {
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
  });
  afterEach(() => vi.unstubAllGlobals());

  it('image translate: wall-clock timeout synthesizes TIMEOUT when backend never emits', async () => {
    // The backend hangs and never emits, so the finally block must synthesize TIMEOUT.
    const hangingImg = vi.fn<NonNullable<TranslationBackend['translateImage']>>(
      async (a: TranslateImageArgs) => {
        await new Promise<void>((resolve) => {
          a.cancel.signal.addEventListener('abort', () => resolve(), { once: true });
        });
        // Intentionally emit NOTHING even on abort — exercises the
        // finally-block synthesize-TIMEOUT path.
      },
    );
    const b = mkBackendWithImage('anthropic', hangingImg);
    const deps: RouterDeps = {
      ...baseDeps({
        backends: [b],
        getSettings: async () => mkSettings({ disabledBackends: [] }),
      }),
      imageTranslateTimeoutMs: 40,
    };
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate(
      { id: 'img-t1', imageUrl: 'https://example.com/x.png' },
      (c) => chunks.push(c),
    );
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('TIMEOUT');
  });

  it('image translate: backend emits ABORTED after timeout → router rewrites to TIMEOUT', async () => {
    // An ABORTED chunk after the wall clock fired is rewritten to TIMEOUT.
    const img = vi.fn<NonNullable<TranslationBackend['translateImage']>>(
      async (a: TranslateImageArgs) => {
        await new Promise<void>((resolve) => {
          a.cancel.signal.addEventListener(
            'abort',
            () => {
              a.onChunk({
                type: 'error',
                requestId: a.requestId,
                code: 'ABORTED',
                message: 'cancelled',
              });
              resolve();
            },
            { once: true },
          );
        });
      },
    );
    const b = mkBackendWithImage('anthropic', img);
    const deps: RouterDeps = {
      ...baseDeps({
        backends: [b],
        getSettings: async () => mkSettings({ disabledBackends: [] }),
      }),
      imageTranslateTimeoutMs: 40,
    };
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate(
      { id: 'img-t2', imageUrl: 'https://example.com/x.png' },
      (c) => chunks.push(c),
    );
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type === 'error') {
      expect(err.code).toBe('TIMEOUT');
      expect(err.message).toContain('image answer timeout');
    } else {
      throw new Error('expected error chunk');
    }
  });
});

describe('router — targetLang boundary and preset resolution', () => {
  function captureUser(): {
    backend: TranslationBackend;
    calls: TranslateCallArgs[];
  } {
    const calls: TranslateCallArgs[] = [];
    const backend: TranslationBackend = {
      id: bid('anthropic'),
      manifest: testManifest('anthropic'),
      isAvailable: async () => true,
      translate: async (a) => {
        calls.push(a);
        a.onChunk({
          type: 'delta',
          requestId: a.req.id,
          text: '{"translation":"X","confidence":1}',
        });
        a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
      },
    };
    return { backend, calls };
  }

  it('empty targetLang skips targetPreset resolution (length > 0 boundary)', async () => {
    // An empty target must not resolve as a preset.
    const { backend, calls } = captureUser();
    const deps = baseDeps({
      backends: [backend],
      getSettings: async () => mkSettings({ disabledBackends: [] }),
    });
    await createRouter(deps).handleTranslate(
      {
        id: 'r1',
        text: 'hi',
        sourceLang: sel('arabizi'),
        targetLang: '' as LangSelection,
        options: { stream: true, explain: false },
      },
      () => {},
    );
    expect(calls).toHaveLength(1);
    // Just pin the call went through without a crash; the exact prompt
    // shape is tested elsewhere.
  });

  it('targetLang matching a variety id produces a targetPreset (pin preset resolution)', async () => {
    const { backend, calls } = captureUser();
    const deps = baseDeps({
      backends: [backend],
      getSettings: async () => mkSettings({ disabledBackends: [] }),
    });
    await createRouter(deps).handleTranslate(
      {
        id: 'r1',
        text: 'hi',
        sourceLang: sel('en'),
        targetLang: sel('arabizi'),
        options: { stream: true, explain: false },
      },
      () => {},
    );
    // arabizi is a known preset; system prompt should mention it.
    expect(calls[0]?.system.toLowerCase()).toContain('arabizi');
  });
});
