import type { TranslationBackend, BackendConfig } from '@/shared/backends/base';

// Without this, every translate costs an HTTP round-trip for Ollama and a process spawn for native.

const DEFAULT_TTL_MS = 30_000;
// A native host that missed one ping is usually still booting; a short negative entry lets the next request find it.
export const NEGATIVE_PROBE_TTL_MS = 5_000;

interface Entry {
  ok: boolean;
  expiresAt: number;
}

function keyFor(id: string, cfg: BackendConfig): string {
  // Only the fields that can flip the answer, so a relevant settings edit busts the entry.
  const apiKey = cfg.apiKeys[id as keyof BackendConfig['apiKeys']] ?? '';
  return [
    id,
    cfg.ollamaUrl ?? '',
    cfg.nativeCli ?? '',
    cfg.localBackendTimeoutMs ?? '',
    // Length only — a DevTools dump of this cache must never expose the key.
    apiKey ? `k${apiKey.length}` : '',
  ].join('');
}

export interface ProbeCache {
  probe(b: TranslationBackend, cfg: BackendConfig): Promise<boolean>;
  clear(): void;
  /** Pushed before each translate, so a settings edit applies without a reload. */
  setTtl(ms: number): void;
}

export function createProbeCache(): ProbeCache {
  const cache = new Map<string, Entry>();
  let ttlMs = DEFAULT_TTL_MS;
  return {
    async probe(b, cfg) {
      const key = keyFor(b.id, cfg);
      const now = Date.now();
      const hit = cache.get(key);
      if (hit && hit.expiresAt > now) return hit.ok;
      let ok: boolean;
      try {
        ok = await b.isAvailable(cfg);
      } catch {
        ok = false;
      }
      const shortMiss = !ok && b.id === 'native';
      cache.set(key, {
        ok,
        expiresAt: now + (shortMiss ? Math.min(ttlMs, NEGATIVE_PROBE_TTL_MS) : ttlMs),
      });
      return ok;
    },
    clear() {
      cache.clear();
    },
    setTtl(ms) {
      if (Number.isFinite(ms) && ms > 0) ttlMs = ms;
    },
  };
}
