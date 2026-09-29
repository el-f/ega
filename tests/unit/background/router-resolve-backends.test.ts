import { describe, it, expect, vi } from 'vitest';
import { createRouter, type RouterDeps } from '@/background/router';
import type { TranslateImageArgs, TranslationBackend } from '@/shared/backends/base';
import type { BackendCapabilities } from '@/shared/backends/base';
import type { Settings, TranslationChunk } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';

const bid = (s: string) => asBackendIdUnsafe(s);

function mkManifest(id: string, canVision: boolean): BackendCapabilities {
  return {
    id: bid(id),
    name: `Stub ${id}`,
    capabilities: { canVision },
  };
}

function mkBackend(opts: {
  id: string;
  canVision: boolean;
  translateImage?: (a: TranslateImageArgs) => Promise<void>;
}): TranslationBackend {
  const base: TranslationBackend = {
    id: bid(opts.id),
    manifest: mkManifest(opts.id, opts.canVision),
    isAvailable: async () => true,
    translate: async () => {},
  };
  return {
    ...base,
    ...(opts.translateImage !== undefined ? { translateImage: opts.translateImage } : {}),
  };
}

function mkOkImageImpl(label: string) {
  return async (a: TranslateImageArgs): Promise<void> => {
    a.onChunk({ type: 'delta', requestId: a.requestId, text: label });
    a.onChunk({ type: 'done', requestId: a.requestId, confidence: 0.9 });
  };
}

function mkSettings(patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    anthropicApiKey: 'k',
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

const IMAGE_URL = 'https://example.com/img.png';

function stubImageFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new Uint8Array(10), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
    ),
  );
}

describe('router image-capability resolution (manifest-driven)', () => {
  it('routes to the manifest.canVision=true backend, skips canVision=false', async () => {
    stubImageFetch();
    const textOnlyImpl = vi.fn(mkOkImageImpl('text-only'));
    const visionImpl = vi.fn(mkOkImageImpl('vision'));
    const textOnly = mkBackend({
      id: 'text-only',
      canVision: false,
      // Hostile shape: structurally has translateImage but declares canVision=false.
      // Manifest must win — this method MUST NOT be called.
      translateImage: textOnlyImpl,
    });
    const vision = mkBackend({
      id: 'vision',
      canVision: true,
      translateImage: visionImpl,
    });
    const settings = mkSettings({
      backendOrder: [bid('text-only'), bid('vision')],
      disabledBackends: [],
    });
    const router = createRouter(baseDeps([textOnly, vision], settings));
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'r1', imageUrl: IMAGE_URL }, (c) => chunks.push(c));
    vi.unstubAllGlobals();

    expect(textOnlyImpl).not.toHaveBeenCalled();
    expect(visionImpl).toHaveBeenCalledOnce();
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });

  it('skips a canVision=false backend even when it structurally has translateImage', async () => {
    stubImageFetch();
    const liarImpl = vi.fn(mkOkImageImpl('liar'));
    const visionImpl = vi.fn(mkOkImageImpl('vision'));
    const liar = mkBackend({
      id: 'liar',
      canVision: false,
      translateImage: liarImpl,
    });
    const vision = mkBackend({
      id: 'vision',
      canVision: true,
      translateImage: visionImpl,
    });
    const settings = mkSettings({
      backendOrder: [bid('liar'), bid('vision')],
      disabledBackends: [],
    });
    const router = createRouter(baseDeps([liar, vision], settings));
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'r2', imageUrl: IMAGE_URL }, (c) => chunks.push(c));
    vi.unstubAllGlobals();

    expect(liarImpl).not.toHaveBeenCalled();
    expect(visionImpl).toHaveBeenCalledOnce();
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });

  it('emits UNSUPPORTED when every backend declares canVision=false', async () => {
    stubImageFetch();
    const textOnlyA = mkBackend({ id: 'a', canVision: false });
    const textOnlyB = mkBackend({ id: 'b', canVision: false });
    const settings = mkSettings({
      backendOrder: [bid('a'), bid('b')],
      disabledBackends: [],
    });
    const router = createRouter(baseDeps([textOnlyA, textOnlyB], settings));
    const chunks: TranslationChunk[] = [];
    await router.handleImageTranslate({ id: 'r3', imageUrl: IMAGE_URL }, (c) => chunks.push(c));
    vi.unstubAllGlobals();

    const err = chunks.find((c) => c.type === 'error');
    expect(err).toBeDefined();
    expect(err && 'code' in err ? err.code : undefined).toBe('UNSUPPORTED');
  });
});
