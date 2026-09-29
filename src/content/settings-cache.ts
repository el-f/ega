import type { Settings } from '@/shared/types';
import { BACKEND_API_KEY_FIELDS } from '@/shared/provider-ids';

let cache: Settings | null = null;
let inflight: Promise<Settings> | null = null;

// The reader drags the settings schema and the whole backend registry behind it — over 100 KB the page must not parse to show a bubble.
function readSettings(): Promise<Settings> {
  return import('@/shared/storage').then((m) => m.getSettings());
}

/** Content scripts never call a backend, so API keys must not sit resident in every page's renderer. */
function stripApiKeys(s: Settings): Settings {
  const copy = { ...s } as Record<string, unknown>;
  for (const k of BACKEND_API_KEY_FIELDS) delete copy[k];
  return copy as unknown as Settings;
}

export function currentSettings(): Settings | null {
  return cache;
}

export function setSettings(s: Settings): void {
  cache = stripApiKeys(s);
}

export async function ensureSettings(): Promise<Settings> {
  if (cache) return cache;
  inflight ??= readSettings().then(stripApiKeys);
  try {
    const s = await inflight;
    // ??=, not =: concurrent callers must share one object, and a later write must not be clobbered.
    cache ??= s;
    return cache;
  } catch (e) {
    inflight = null;
    throw e;
  }
}

export function preloadSettings(): void {
  inflight ??= readSettings().then(stripApiKeys);
  inflight
    .then((s) => {
      cache ??= s;
    })
    .catch(() => {
      inflight = null;
    });
}

export function resetSettingsCacheForTest(): void {
  cache = null;
  inflight = null;
}
