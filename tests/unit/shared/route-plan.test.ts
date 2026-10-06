// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { boundedChain, createChainResolver } from '@/background/router-chain';
import type { BackendConfig, TranslationBackend } from '@/shared/backends/base';
import { buildBackendConfig } from '@/shared/backends/build-config';
import { backendHasRequiredKey } from '@/shared/backends/key-presence';
import { resolveBackend } from '@/shared/backends/registry';
import { computeBackendOrder } from '@/shared/backends/select';
import { apiKeyField, CLOUD_PROVIDER_IDS } from '@/shared/provider-ids';
import { asBackendIdUnsafe } from '@/shared/brands';
import { routePlan, type ImageAbility, type Readiness } from '@/shared/route-plan';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import type { BackendId, Settings } from '@/shared/types';
import { testManifest } from '@tests/_helpers/backend';

const bid = (s: string): BackendId => asBackendIdUnsafe(s);
const cfg = {} as BackendConfig;
const NAMES = ['anthropic', 'gemini', 'native', 'ollama', 'openai', 'groq', 'localserver'];

interface Fake {
  ready: boolean;
  canVision: boolean;
  accepts: boolean | undefined;
  hasImageMethod: boolean;
}

function fakeBackend(id: string, f: Fake): TranslationBackend {
  return {
    id: bid(id),
    manifest: testManifest(id, f.canVision),
    isAvailable: async () => f.ready,
    translate: async () => {},
    ...(f.hasImageMethod ? { translateImage: async () => {} } : {}),
    ...(f.accepts !== undefined ? { acceptsImages: async () => f.accepts === true } : {}),
  };
}

function settingsFor(order: string[], disabled: string[], retryCount: number): Settings {
  return {
    ...DEFAULT_SETTINGS,
    backendOrder: order.map(bid),
    disabledBackends: disabled.map(bid),
    advanced: { ...DEFAULT_SETTINGS.advanced, retryCount },
  };
}

const probeCache = {
  probe: (b: TranslationBackend, c: BackendConfig) => b.isAvailable(c),
  clear: () => {},
  setTtl: () => {},
};

const arbFake: fc.Arbitrary<Fake> = fc.record({
  ready: fc.boolean(),
  canVision: fc.boolean(),
  accepts: fc.option(fc.boolean(), { nil: undefined }),
  hasImageMethod: fc.boolean(),
});

const arbWorld = fc.record({
  order: fc.shuffledSubarray(NAMES, { minLength: 0, maxLength: NAMES.length }),
  disabled: fc.subarray(NAMES),
  retryCount: fc.integer({ min: 0, max: 3 }),
  fakes: fc.tuple(...NAMES.map(() => arbFake)),
});

function readinessOf(fakes: Record<string, Fake>): Map<BackendId, Readiness> {
  return new Map(NAMES.map((n) => [bid(n), fakes[n]?.ready ? 'ready' : 'not-ready']));
}

function imageOf(fakes: Record<string, Fake>): (id: BackendId) => ImageAbility {
  return (id) => {
    const f = fakes[String(id)];
    if (!f) return { inImageChain: false, answersImages: false };
    return { inImageChain: f.canVision && f.accepts !== false, answersImages: f.hasImageMethod };
  };
}

describe('routePlan matches the router (T-R1, T-R1b)', () => {
  it('first and backup rows are, in order, the chain the router tries for text', async () => {
    await fc.assert(
      fc.asyncProperty(arbWorld, async ({ order, disabled, retryCount, fakes: list }) => {
        const fakes = Object.fromEntries(NAMES.map((n, i) => [n, list[i] as Fake]));
        const backends = NAMES.map((n) => fakeBackend(n, fakes[n] as Fake));
        const s = settingsFor(order, disabled, retryCount);
        const routerIds = boundedChain(
          await createChainResolver(backends, probeCache)(s, cfg, 'translate'),
          s,
        ).map((b) => b.id);
        const plan = routePlan(
          computeBackendOrder(
            s,
            backends.map((b) => b.id),
          ),
          readinessOf(fakes),
          1 + retryCount,
        );
        const marked = plan.rows
          .filter((r) => r.label.kind === 'first' || r.label.kind === 'backup')
          .map((r) => r.id);
        expect(marked).toEqual(routerIds);
        expect(plan.tried).toEqual(routerIds);
      }),
      { numRuns: 300 },
    );
  });

  it('first for images is the first backend the router tries for an image', async () => {
    await fc.assert(
      fc.asyncProperty(arbWorld, async ({ order, disabled, retryCount, fakes: list }) => {
        const fakes = Object.fromEntries(NAMES.map((n, i) => [n, list[i] as Fake]));
        const backends = NAMES.map((n) => fakeBackend(n, fakes[n] as Fake));
        const s = settingsFor(order, disabled, retryCount);
        const routerFirst =
          boundedChain(await createChainResolver(backends, probeCache)(s, cfg, 'translateImage'), s)
            .filter((b) => b.translateImage !== undefined)
            .map((b) => b.id)[0] ?? null;
        const plan = routePlan(
          computeBackendOrder(
            s,
            backends.map((b) => b.id),
          ),
          readinessOf(fakes),
          1 + retryCount,
          imageOf(fakes),
        );
        expect(plan.firstForImages).toEqual(routerFirst);
      }),
      { numRuns: 300 },
    );
  });
});

describe('routePlan labels', () => {
  const order = ['a', 'b', 'c', 'd', 'e'].map(bid);
  const ready = (m: Record<string, Readiness>): Map<BackendId, Readiness> =>
    new Map(Object.entries(m).map(([k, v]) => [bid(k), v]));
  const kinds = (p: ReturnType<typeof routePlan>): string[] =>
    p.rows.map((r) => (r.label.kind === 'backup' ? `backup${r.label.n}` : r.label.kind));

  it('T-R2: First choice is never on a skipped row, and with no ready row there is none', () => {
    const plan = routePlan(
      order,
      ready({ a: 'not-ready', b: 'ready', c: 'ready', d: 'not-ready', e: 'ready' }),
      2,
    );
    expect(kinds(plan)).toEqual(['skipped', 'first', 'backup1', 'skipped', 'not-reached']);
    const none = routePlan(
      order,
      ready({ a: 'not-ready', b: 'not-ready', c: 'not-ready', d: 'not-ready', e: 'not-ready' }),
      4,
    );
    expect(kinds(none)).not.toContain('first');
    expect(none.tried).toEqual([]);
  });

  it('T-R3: rows below an unknown row wait, except those already known to be skipped', () => {
    const open = routePlan(
      order,
      ready({ a: 'unknown', b: 'ready', c: 'not-ready', d: 'ready', e: 'unknown' }),
      3,
    );
    expect(kinds(open)).toEqual(['unknown', 'unknown', 'skipped', 'unknown', 'unknown']);
    expect(open.tried).toEqual([]);
    const settled = routePlan(
      order,
      ready({ a: 'not-ready', b: 'ready', c: 'not-ready', d: 'ready', e: 'unknown' }),
      3,
    );
    expect(kinds(settled)).toEqual(['skipped', 'first', 'skipped', 'backup1', 'unknown']);
  });

  it('a row with no answer past a full chain cannot change who is tried', () => {
    const full = routePlan(order, ready({ a: 'ready', b: 'unknown', c: 'ready' }), 1);
    expect(kinds(full)).toEqual(['first', 'unknown', 'not-reached', 'unknown', 'unknown']);
    expect(full.tried).toEqual([bid('a')]);
  });

  it('an image check still open above the first image backend leaves it unknown', () => {
    const image = (id: BackendId): ImageAbility =>
      String(id) === 'a'
        ? { inImageChain: 'unknown', answersImages: true }
        : { inImageChain: true, answersImages: true };
    expect(routePlan(order, ready({ a: 'ready', b: 'ready' }), 2, image).firstForImages).toBe(
      'unknown',
    );
  });
});

describe('cloud readiness derivation (T-R7)', () => {
  it('a cloud backend is available exactly when the settings hold its key', async () => {
    for (const id of CLOUD_PROVIDER_IDS) {
      const backend = resolveBackend(id);
      if (!backend) throw new Error(`${id} is not registered`);
      for (const key of ['', 'sk-test-key']) {
        const s: Settings = { ...DEFAULT_SETTINGS, [apiKeyField(id)]: key };
        expect(await backend.isAvailable(buildBackendConfig(s)), `${id} key=${key}`).toBe(
          backendHasRequiredKey(bid(id), s),
        );
      }
    }
  });
});
