import type { BackendConfig, TranslationBackend } from './base';

/** Probes all backends in parallel; every id is a key, in backend order, so map[id] is never undefined. */
export async function probeAll(
  backends: TranslationBackend[],
  cfg: BackendConfig,
): Promise<Record<string, boolean>> {
  const available = await Promise.all(backends.map((b) => b.isAvailable(cfg)));
  return Object.fromEntries(backends.map((b, i) => [b.id, available[i] === true]));
}
