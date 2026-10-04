/** Checked replacement for a bare `as T` on a chrome.storage read. */
export function decodeOrFallback<T>(
  raw: unknown,
  predicate: (x: unknown) => x is T,
  fallback: T,
): T {
  return predicate(raw) ? raw : fallback;
}
