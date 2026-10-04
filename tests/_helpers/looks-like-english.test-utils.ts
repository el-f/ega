import { detectorCacheInternal } from '@/content/looks-like-english';

/** Clears the cached detector promise so each test can install its own
 *  mock `LanguageDetector` on globalThis. Imported only by tests. */
export function resetDetectorCache(): void {
  detectorCacheInternal.promise = null;
}
