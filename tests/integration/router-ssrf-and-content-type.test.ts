import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRouter } from '@/background/router';
import type { TranslationBackend, TranslateImageArgs } from '@/shared/backends/base';
import type { TranslationChunk, Settings } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';
import { validateImageUrl } from '@/shared/image-url-guard';
import { baseDeps } from '@tests/_helpers/router';

const bid = (s: string) => asBackendIdUnsafe(s);

/** SSRF validator and Content-Type regex boundaries. */

function mkBackendWithImage(
  id: string,
  translateImage: NonNullable<TranslationBackend['translateImage']>,
): TranslationBackend {
  return {
    id: bid(id),
    manifest: testManifest(id, true),
    isAvailable: async () => true,
    translate: async (a) => {
      a.onChunk({
        type: 'delta',
        requestId: a.req.id,
        text: '{"translation":"ok","confidence":1}',
      });
      a.onChunk({ type: 'done', requestId: a.req.id, confidence: 1 });
    },
    translateImage,
  };
}

function mkSettings(patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    anthropicApiKey: 'k',
    ...patch,
  };
}

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
      a.onChunk({
        type: 'delta',
        requestId: a.requestId,
        text: '{"translation":"","confidence":0}',
      });
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

describe('router — Content-Type regex anchors', () => {
  afterEach(() => vi.unstubAllGlobals());

  // Both regex anchors must hold: text before or after the image type is rejected.
  it('rejects "xyzimage/png" (not an image/ type)', async () => {
    const chunks = await runWithType('xyzimage/png');
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
  });

  it('rejects "image/pngextra"', async () => {
    const chunks = await runWithType('image/pngextra');
    const err = chunks.find((c) => c.type === 'error');
    expect(err?.type === 'error' ? err.code : null).toBe('IMAGE_UNSUPPORTED');
  });

  it('accepts "image/png; charset=utf-8" (parameters stripped, base type still exact-matched)', async () => {
    // Params are stripped before the exact base-type match, so they never widen the allow-list.
    const chunks = await runWithType('image/png; charset=utf-8');
    expect(chunks.some((c) => c.type === 'error')).toBe(false);
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });
});

describe('router — SSRF IPv4 octet boundaries', () => {
  async function runUrl(imageUrl: string): Promise<TranslationChunk[]> {
    const imgSpy = vi.fn<NonNullable<TranslationBackend['translateImage']>>(
      async (a: TranslateImageArgs) => {
        a.onChunk({
          type: 'delta',
          requestId: a.requestId,
          text: '{"translation":"","confidence":0}',
        });
        a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
      },
    );
    const b = mkBackendWithImage('anthropic', imgSpy);
    const deps = baseDeps({
      backends: [b],
      getSettings: async () => mkSettings({ disabledBackends: [] }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate({ id: `img-${Math.random()}`, imageUrl }, (c) =>
      chunks.push(c),
    );
    return chunks;
  }

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

  function wasValidatorRejection(chunks: TranslationChunk[]): boolean {
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type !== 'error') return false;
    // The URL guard has its own copy, so this still separates it from a size/type rejection.
    return err.code === 'IMAGE_UNSUPPORTED' && err.message.includes('web address');
  }

  // RFC 6598 CGN guard 100.64.0.0/10 covers Alibaba metadata (100.100.100.200) plus
  // all carrier-grade NAT addresses. Boundary tests isolate the oct1=100 / oct2 in [64,127] checks.
  it('blocks 100.100.100.200 (Alibaba metadata, inside CGN)', async () => {
    expect(wasValidatorRejection(await runUrl('http://100.100.100.200/'))).toBe(true);
  });

  it('blocks 100.64.0.0 (CGN lower bound)', async () => {
    expect(wasValidatorRejection(await runUrl('http://100.64.0.0/'))).toBe(true);
  });

  it('blocks 100.127.255.254 (CGN upper bound)', async () => {
    expect(wasValidatorRejection(await runUrl('http://100.127.255.254/'))).toBe(true);
  });

  it('does NOT block 100.63.255.255 (pins oct2 >= 64 boundary)', async () => {
    expect(wasValidatorRejection(await runUrl('http://100.63.255.255/'))).toBe(false);
  });

  it('does NOT block 100.128.0.0 (pins oct2 <= 127 boundary)', async () => {
    expect(wasValidatorRejection(await runUrl('http://100.128.0.0/'))).toBe(false);
  });

  it('does NOT block 99.100.100.200 (pins oct1 === 100 boundary)', async () => {
    expect(wasValidatorRejection(await runUrl('http://99.100.100.200/'))).toBe(false);
  });

  it('does NOT block 101.100.100.200 (pins oct1 === 100 boundary from above)', async () => {
    expect(wasValidatorRejection(await runUrl('http://101.100.100.200/'))).toBe(false);
  });

  // 169.254.x.x block is a 2-way &&. Both halves must matter.
  it('blocks 169.254.169.254 and 169.254.0.1 (link-local range, not just metadata host)', async () => {
    expect(wasValidatorRejection(await runUrl('http://169.254.169.254/'))).toBe(true);
    expect(wasValidatorRejection(await runUrl('http://169.254.0.1/'))).toBe(true);
  });

  it('does NOT block 169.253.169.254 (pins oct2 === 254 boundary)', async () => {
    expect(wasValidatorRejection(await runUrl('http://169.253.169.254/'))).toBe(false);
  });

  it('does NOT block 170.254.169.254 (pins oct1 === 169 boundary)', async () => {
    expect(wasValidatorRejection(await runUrl('http://170.254.169.254/'))).toBe(false);
  });

  // 0.0.0.0/8 block is oct1 === 0 — any first octet 0 is blocked.
  it('blocks 0.x.y.z (entire /8, not just 0.0.0.0)', async () => {
    expect(wasValidatorRejection(await runUrl('http://0.0.0.0/'))).toBe(true);
    expect(wasValidatorRejection(await runUrl('http://0.1.2.3/'))).toBe(true);
  });

  it('does NOT block 1.2.3.4 (public-routable pins oct1 === 0 boundary)', async () => {
    expect(wasValidatorRejection(await runUrl('http://1.2.3.4/'))).toBe(false);
  });

  // Multicast boundary at 224.
  it('does NOT block 223.255.255.255 (pins oct1 >= 224 boundary from below)', async () => {
    expect(wasValidatorRejection(await runUrl('http://223.255.255.255/'))).toBe(false);
  });

  it('blocks 224.0.0.1 and 255.255.255.255 (multicast + reserved)', async () => {
    expect(wasValidatorRejection(await runUrl('http://224.0.0.1/'))).toBe(true);
    expect(wasValidatorRejection(await runUrl('http://255.255.255.255/'))).toBe(true);
  });
});

describe('router — IPv4 regex anchors', () => {
  // Unanchored, the IPv4 regex would read "prefix-1.2.3.4" or "1.2.3.4.5" as an IP.
  async function runUrl(imageUrl: string): Promise<TranslationChunk[]> {
    const imgSpy = vi.fn<NonNullable<TranslationBackend['translateImage']>>(
      async (a: TranslateImageArgs) => {
        a.onChunk({
          type: 'delta',
          requestId: a.requestId,
          text: '{"translation":"","confidence":0}',
        });
        a.onChunk({ type: 'done', requestId: a.requestId, confidence: 1 });
      },
    );
    const b = mkBackendWithImage('anthropic', imgSpy);
    const deps = baseDeps({
      backends: [b],
      getSettings: async () => mkSettings({ disabledBackends: [] }),
    });
    const chunks: TranslationChunk[] = [];
    await createRouter(deps).handleImageTranslate({ id: `img-${Math.random()}`, imageUrl }, (c) =>
      chunks.push(c),
    );
    return chunks;
  }

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

  function ipReservedRejection(chunks: TranslationChunk[]): boolean {
    const err = chunks.find((c) => c.type === 'error');
    if (err?.type !== 'error') return false;
    return err.code === 'IMAGE_UNSUPPORTED' && err.message.includes('web address');
  }

  it('"0x.example.com" (name starting with 0-looking chars) does NOT trigger 0/8 block — pins regex ^ anchor', async () => {
    // Regex without ^ anchor would still match the trailing IP portion
    // of some malformed hostnames. DNS name should pass the IPv4 branch.
    const chunks = await runUrl('http://0x.example.com/');
    expect(ipReservedRejection(chunks)).toBe(false);
  });

  it('"1.2.3.4.5" (5-octet) is not blocked as a reserved IP — pins regex $ anchor', () => {
    // Asserted on the guard, not the router: WHATWG URL already rejects this host as unparseable,
    // and the router's user-facing copy is the same sentence for every URL rejection.
    const verdict = validateImageUrl('http://1.2.3.4.5/');
    expect(verdict.ok === false ? verdict.reason : '').not.toMatch(/reserved|metadata/);
  });

  it('"1.2.3.4" IS blocked when it lands in a reserved range — the anchor still matches a real IP', () => {
    const verdict = validateImageUrl('http://169.254.169.254/');
    expect(verdict.ok === false ? verdict.reason : '').toMatch(/reserved|metadata/);
  });
});
