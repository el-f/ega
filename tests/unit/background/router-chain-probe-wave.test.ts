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

describe('the probe quota bounds what is FOUND, not what is looked at', () => {
  it('returns at most the quota even when more are healthy', async () => {
    const names = ['a', 'b', 'c', 'd', 'e'];
    const t = tracker();
    const resolve = createChainResolver(
      names.map((n) => backend(n)),
      t.cache,
    );

    // retryCount 0 -> maxAttempts 1, but the floor is 3.
    const out = await resolve(settings(names, 0), 'translate', cfg, 'translate');

    expect(out).toHaveLength(3);
    expect(ids(out)).toEqual(['a', 'b', 'c']);
  });

  it('walks past a dead head into a second wave to fill the quota', async () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    const t = tracker((id) => ['d', 'e', 'f'].includes(id));
    const resolve = createChainResolver(
      names.map((n) => backend(n)),
      t.cache,
    );

    const out = await resolve(settings(names, 0), 'translate', cfg, 'translate');

    expect(ids(out)).toEqual(['d', 'e', 'f']);
    // First wave a,b,c found nothing, so a second wave had to run — the loop steps by the quota.
    expect(t.probed.slice(0, 3)).toEqual(['a', 'b', 'c']);
    expect(t.probed).toContain('f');
  });

  it('stops after the wave that fills the quota, leaving the tail unprobed', async () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    const t = tracker();
    const resolve = createChainResolver(
      names.map((n) => backend(n)),
      t.cache,
    );

    await resolve(settings(names, 0), 'translate', cfg, 'translate');

    expect(t.probed).toEqual(['a', 'b', 'c']);
    expect(t.probed).not.toContain('d');
  });

  it('a bigger retry budget raises the quota above the floor of three', async () => {
    const names = ['a', 'b', 'c', 'd', 'e'];
    const t = tracker();
    const resolve = createChainResolver(
      names.map((n) => backend(n)),
      t.cache,
    );

    const out = await resolve(settings(names, 4), 'translate', cfg, 'translate');

    expect(out).toHaveLength(5);
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

    const out = await resolve(settings(many, 0), 'translate', cfg, 'translate');

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

    const out = await resolve(settings(names, 0), 'translate', cfg, 'translateImage');

    expect(t.probed).toEqual(names);
    expect(out).toHaveLength(5);
  });

  it('drops a backend that cannot see, without spending a probe on it', async () => {
    const t = tracker();
    const resolve = createChainResolver(
      [backend('text-only', false), backend('sighted', true)],
      t.cache,
    );

    const out = await resolve(
      settings(['text-only', 'sighted'], 0),
      'translate',
      cfg,
      'translateImage',
    );

    expect(ids(out)).toEqual(['sighted']);
    expect(t.probed).toEqual(['sighted']);
  });

  it('keeps a text-only backend for a text request', async () => {
    const t = tracker();
    const resolve = createChainResolver(
      [backend('text-only', false), backend('sighted', true)],
      t.cache,
    );

    const out = await resolve(settings(['text-only', 'sighted'], 0), 'translate', cfg, 'translate');

    expect(ids(out)).toEqual(['text-only', 'sighted']);
  });
});
