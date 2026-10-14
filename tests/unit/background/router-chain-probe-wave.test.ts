// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createChainResolver } from '@/background/router-chain';
import type { BackendConfig, TranslationBackend } from '@/shared/backends/base';
import type { BackendId, Settings } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { BACKEND_CHAIN_MAX } from '@/shared/settings-schema';
import { asBackendIdUnsafe } from '@/shared/brands';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string): BackendId => asBackendIdUnsafe(s);
const cfg = {} as BackendConfig;

function backend(id: string, canVision = false): TranslationBackend {
  return {
    id: bid(id),
    manifest: testManifest(id, canVision),
    isAvailable: async () => true,
    translate: async () => {},
    ...(canVision ? { translateImage: async () => {} } : {}),
  };
}

function settings(order: string[], retryCount = 2): Settings {
  return {
    ...DEFAULT_SETTINGS,
    backendOrder: order.map(bid),
    disabledBackends: [],
    advanced: { ...DEFAULT_SETTINGS.advanced, retryCount },
  };
}

/** Records probe order so a test can assert waves, not just the result. */
function tracker(available: (id: string) => boolean = () => true) {
  const probed: string[] = [];
  return {
    probed,
    cache: {
      probe: async (b: TranslationBackend) => {
        probed.push(String(b.id));
        return available(String(b.id));
      },
      clear: () => {},
      setTtl: () => {},
    },
  };
}

const ids = (bs: readonly TranslationBackend[]): string[] => bs.map((b) => String(b.id));

describe('all enabled eligible backends form the chain', () => {
  it('returns every healthy backend even with a legacy zero retry budget', async () => {
    const names = ['a', 'b', 'c', 'd', 'e'];
    const t = tracker();
    const resolve = createChainResolver(
      names.map((n) => backend(n)),
      t.cache,
    );

    const out = await resolve(settings(names, 0), cfg, 'translate');

    expect(ids(out)).toEqual(names);
  });

  it('skips unavailable backends while preserving order', async () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    const t = tracker((id) => ['d', 'e', 'f'].includes(id));
    const resolve = createChainResolver(
      names.map((n) => backend(n)),
      t.cache,
    );

    const out = await resolve(settings(names, 0), cfg, 'translate');

    expect(ids(out)).toEqual(['d', 'e', 'f']);
    expect(t.probed.slice(0, 3)).toEqual(['a', 'b', 'c']);
    expect(t.probed).toContain('f');
  });

  it('does not probe a disabled backend or include it in the chain', async () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    const t = tracker();
    const resolve = createChainResolver(
      names.map((n) => backend(n)),
      t.cache,
    );

    const out = await resolve(
      { ...settings(names, 0), disabledBackends: [bid('b'), bid('e')] },
      cfg,
      'translate',
    );

    expect(t.probed).toEqual(['a', 'c', 'd', 'f']);
    expect(ids(out)).toEqual(['a', 'c', 'd', 'f']);
  });

  it('preserves backend order when probes finish in a different order', async () => {
    const names = ['a', 'b', 'c', 'd', 'e'];
    const t = tracker();
    const finished: string[] = [];
    let releaseFirst: () => void = () => {};
    const first = new Promise<void>((resolve) => (releaseFirst = resolve));
    let otherProbesFinished: () => void = () => {};
    const others = new Promise<void>((resolve) => (otherProbesFinished = resolve));
    t.cache.probe = async (b) => {
      t.probed.push(String(b.id));
      if (b.id === bid('a')) await first;
      finished.push(String(b.id));
      if (finished.length === names.length - 1) otherProbesFinished();
      return true;
    };
    const resolve = createChainResolver(
      names.map((n) => backend(n)),
      t.cache,
    );

    const pending = resolve(settings(names), cfg, 'translate');
    await others;
    expect(finished).toEqual(['b', 'c', 'd', 'e']);
    releaseFirst();
    const out = await pending;

    expect(ids(out)).toEqual(names);
  });
});

describe('the candidate ceiling', () => {
  it('is derived from the registry, so a longer real order is not truncated to the literal', async () => {
    const many = Array.from({ length: BACKEND_CHAIN_MAX + 3 }, (_, i) => `b${String(i)}`);
    const last = many[many.length - 1] ?? '';
    const t = tracker((id) => id === last);
    const resolve = createChainResolver(
      many.map((n) => backend(n)),
      t.cache,
    );

    const out = await resolve(settings(many, 0), cfg, 'translate');

    expect(ids(out)).toEqual([last]);
    expect(t.probed).toContain(last);
  });
});

describe('the image path', () => {
  it('probes the whole order in one wave, with no quota', async () => {
    const names = ['a', 'b', 'c', 'd', 'e'];
    const t = tracker();
    const backends = names.map((n) => backend(n, true));
    const resolve = createChainResolver(backends, t.cache);

    const out = await resolve(settings(names, 0), cfg, 'translateImage');

    expect(t.probed).toEqual(names);
    expect(out).toHaveLength(5);
  });

  it('drops a backend that cannot see, without spending a probe on it', async () => {
    const t = tracker();
    const resolve = createChainResolver(
      [backend('text-only', false), backend('sighted', true)],
      t.cache,
    );

    const out = await resolve(settings(['text-only', 'sighted'], 0), cfg, 'translateImage');

    expect(ids(out)).toEqual(['sighted']);
    expect(t.probed).toEqual(['sighted']);
  });

  it('keeps a text-only backend for a text request', async () => {
    const t = tracker();
    const resolve = createChainResolver(
      [backend('text-only', false), backend('sighted', true)],
      t.cache,
    );

    const out = await resolve(settings(['text-only', 'sighted'], 0), cfg, 'translate');

    expect(ids(out)).toEqual(['text-only', 'sighted']);
  });
});
