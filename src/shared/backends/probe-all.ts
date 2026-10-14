import type { BackendConfig, TranslationBackend } from './base';

/** Probes all backends in parallel; every id is a key, so map[id] is never undefined. */
export async function probeAll(
  backends: TranslationBackend[],
  cfg: BackendConfig,
): Promise<Record<string, boolean>> {
  const map: Record<string, boolean> = {};
  for (const b of backends) map[b.id] = false;
  await Promise.all(
    backends.map(async (b) => {
      map[b.id] = await b.isAvailable(cfg);
    }),
  );
  return map;
}
