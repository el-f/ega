import type { Settings } from '@/shared/types';
import { STORAGE_KEYS } from '@/shared/constants';
import { sendMsg } from '@/shared/messages';
import { onStoredChange } from '@/shared/stored-changes';
import { debugCatch, setLogLevel } from '@/shared/logger';

let cache: Settings | null = null;
let inflight: Promise<Settings> | null = null;
const updateListeners = new Set<(s: Settings) => void>();

// The worker parses: the storage reader drags the settings schema and the backend registry, and the reply has no API keys.
async function readSettings(): Promise<Settings> {
  const s = await sendMsg({ kind: 'content:read-settings' });
  if (!s) throw new Error('the worker sent no settings');
  setLogLevel(s.advanced.debugLogLevel);
  return s;
}

export function currentSettings(): Settings | null {
  return cache;
}

export function setSettings(s: Settings): void {
  cache = s;
}

/** Re-reads on each settings change; two quick changes can answer in either order, so an older read is dropped. */
export function watchSettings(): () => void {
  let token = 0;
  return onStoredChange((changes) => {
    if (!(STORAGE_KEYS.settings in changes)) return;
    const mine = ++token;
    readSettings()
      .then((s) => {
        if (mine !== token) return;
        setSettings(s);
        for (const fn of [...updateListeners]) fn(s);
      })
      .catch((e: unknown) => debugCatch(e, 'content.watchSettings'));
  });
}

/** Runs after each re-read watchSettings applies; returns an unsubscribe. */
export function onSettingsUpdate(fn: (s: Settings) => void): () => void {
  updateListeners.add(fn);
  return () => updateListeners.delete(fn);
}

export async function ensureSettings(): Promise<Settings> {
  if (cache) return cache;
  inflight ??= readSettings();
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
  inflight ??= readSettings();
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
