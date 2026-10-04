import type { BackendId, Settings } from '@/shared/types';
import type { BackendConfig, TranslationBackend } from '@/shared/backends/base';
import { computeBackendOrder } from '@/shared/backends/select';
import { BACKEND_CHAIN_MAX, resolveModelId } from '@/shared/settings-schema';
import { DEFAULT_OLLAMA_URL } from '@/shared/constants';
import { localServerBaseUrl } from '@/shared/backends/local-server';
import type { ProbeCache } from './probe-cache';

const NO_BACKEND_MESSAGE = 'No backend is set up yet. Open Settings → Backends and add an API key.';

/** Why the chain came back empty, in words the user can act on: a key is missing, or a local backend is not running. */
export function describeEmptyChain(
  s: Settings,
  cfg: BackendConfig,
  backends: readonly TranslationBackend[],
): string {
  const byId = new Map(backends.map((b) => [String(b.id), b]));
  const ids = computeBackendOrder(
    s,
    backends.map((b) => b.id),
  ).map(String);
  const keys = cfg.apiKeys as Partial<Record<string, string>>;
  const keyed = ids.filter((id) => (keys[id] ?? '') !== '');
  const local = ids.filter((id) => id === 'ollama' || id === 'localserver' || id === 'native');
  // Native is on by default, so a fresh profile reaches here with nothing the user chose; Ollama and the local server are choices.
  if (keyed.length === 0 && local.every((id) => id === 'native')) {
    const off = s.disabledBackends.map(String).find((id) => (keys[id] ?? '') !== '');
    if (off !== undefined) {
      const orNative = local.length > 0 ? ', or install and start the native CLI host' : '';
      return `${byId.get(off)?.manifest.name ?? off} has an API key but is turned off. Press Enable on its card in Settings → Backends${orNative}.`;
    }
    if (local.length === 0) return NO_BACKEND_MESSAGE;
    return `${NO_BACKEND_MESSAGE.slice(0, -1)}, or install and start the native CLI host.`;
  }
  const localWhat = local
    .map((id) =>
      id === 'ollama'
        ? `Ollama at ${cfg.ollamaUrl ?? DEFAULT_OLLAMA_URL}`
        : id === 'localserver'
          ? `the local server at ${localServerBaseUrl(cfg.localServerUrl)}`
          : 'the native CLI host',
    )
    .join(' and ');
  if (keyed.length === 0) {
    return `No backend answered. ${localWhat.charAt(0).toUpperCase()}${localWhat.slice(1)} did not respond — start it, or add an API key in Settings → Backends.`;
  }
  const keyedWhat = keyed.map((id) => byId.get(id)?.manifest.name ?? id).join(', ');
  const localPart = local.length > 0 ? `, and ${localWhat} did not respond` : '';
  return `No backend answered. ${keyedWhat} failed the connection check${localPart}. Check the key and your network in Settings → Backends.`;
}

/** A backend in the chain whose model reads no images: the image chain skips it, so the user needs a model, not a backend. */
export async function describeTextOnlyModel(
  s: Settings,
  cfg: BackendConfig,
  backends: readonly TranslationBackend[],
): Promise<string | null> {
  const order = computeBackendOrder(
    s,
    backends.map((b) => b.id),
  );
  for (const id of order) {
    const b = backends.find((x) => x.id === id);
    if (!b?.acceptsImages || !b.manifest.capabilities.canVision) continue;
    if (await b.acceptsImages(cfg).catch(() => true)) continue;
    const model = resolveModelId(cfg.model, String(id));
    return `${b.manifest.name} model "${model}" cannot read images. Pick a model tagged vision in Settings → Backends (for example, ollama pull gemma4), or set up another backend that reads images.`;
  }
  return null;
}

export type Capability = 'translate' | 'translateImage';

export type ChainResolver = (
  s: Settings,
  cfg: BackendConfig,
  capability: Capability,
) => Promise<TranslationBackend[]>;

/**
 * Backends to try, in `backendOrder`. `capability` drops backends missing the method,
 * which is how vision-less backends stay out of the OCR chain.
 */
export function createChainResolver(
  backends: readonly TranslationBackend[],
  probeCache: ProbeCache,
): ChainResolver {
  const registeredIds = backends.map((b) => b.id);
  const byId = new Map(backends.map((b) => [b.id, b]));
  // Derived, not a literal: a repeated or unregistered id in a stored order must not push a real backend past the ceiling.
  const probeCandidateCeiling = Math.max(backends.length, BACKEND_CHAIN_MAX);

  return async function resolveBackends(s, cfg, capability) {
    probeCache.setTtl(s.advanced.backendProbeTtlMs);
    const supports = (b: TranslationBackend): boolean =>
      capability === 'translate' || b.manifest.capabilities.canVision;
    // The image path walks the whole order so a vision-capable backend low in the list stays reachable.
    const maxAttempts = 1 + s.advanced.retryCount;
    const probeLimit = capability === 'translateImage' ? Infinity : Math.max(3, maxAttempts);
    // The one chain rule lives in select.ts.
    const order = computeBackendOrder(s, registeredIds);

    async function probeWave(ids: readonly BackendId[]): Promise<TranslationBackend[]> {
      const probes = await Promise.all(
        ids.map(async (id) => {
          const b = byId.get(id);
          if (!b || !supports(b)) return null;
          const ok = await probeCache.probe(b, cfg).catch(() => false);
          if (!ok) return null;
          // A text-only local model would fail the image call; skip it so the chain reaches a vision backend.
          if (capability === 'translateImage' && b.acceptsImages) {
            return (await b.acceptsImages(cfg).catch(() => true)) ? b : null;
          }
          return b;
        }),
      );
      return probes.filter((b): b is TranslationBackend => b !== null);
    }

    /** `probeLimit` bounds available backends found, not backends looked at: slicing candidates would make a configured backend past the window unreachable. */
    async function probeAll(ids: readonly BackendId[]): Promise<TranslationBackend[]> {
      if (!Number.isFinite(probeLimit)) return probeWave(ids);
      const candidates = ids.slice(0, probeCandidateCeiling);
      const found: TranslationBackend[] = [];
      // One wave covers the whole quota, so a healthy head costs a single round trip.
      for (let i = 0; i < candidates.length && found.length < probeLimit; i += probeLimit) {
        found.push(...(await probeWave(candidates.slice(i, i + probeLimit))));
      }
      return found.slice(0, probeLimit);
    }

    return probeAll(order);
  };
}

/** Trims a resolved chain to the per-request attempt budget. */
export function boundedChain(
  chain: readonly TranslationBackend[],
  s: Settings,
): TranslationBackend[] {
  return chain.slice(0, 1 + s.advanced.retryCount);
}
