import { STORAGE_KEYS } from '@/shared/constants';
import type { CustomLanguage } from '@/shared/types';

// Shares the lazy storage chunk with settings-cache, so no page pays for the backend registry up front.
function getCustomLanguages(): Promise<CustomLanguage[]> {
  return import('@/shared/storage').then((m) => m.getCustomLanguages());
}

/** `selectionchange` fires many times per drag, so the rarely-changing customLanguages list is cached in memory. */
let cache: CustomLanguage[] | null = null;
// An in-flight read captures this before its await; a changed token at resolve time means the result is stale.
let cacheToken = 0;

export async function ensureCustomLanguages(): Promise<CustomLanguage[]> {
  if (cache) return cache;
  const myToken = cacheToken;
  const list = await getCustomLanguages();
  if (myToken !== cacheToken) {
    // Invalidator fired during the await — drop the stale result and read again.
    return ensureCustomLanguages();
  }
  cache = list;
  return cache;
}

/** Sync view for render paths. Empty until the first async read lands, which every
 *  translate does before it opens a surface. */
export function cachedCustomLanguages(): readonly CustomLanguage[] {
  return cache ?? [];
}

/** Test hook — reset for a fresh read path in unit tests. */
export function resetCustomLanguagesCache(): void {
  cache = null;
  cacheToken++;
}

/** Install the local-area onChanged listener that invalidates the cache. */
export function installCustomLanguagesInvalidator(): void {
  chrome.storage.local.onChanged.addListener((changes) => {
    if (STORAGE_KEYS.customLanguages in changes) {
      cache = null;
      cacheToken++;
    }
  });
}
