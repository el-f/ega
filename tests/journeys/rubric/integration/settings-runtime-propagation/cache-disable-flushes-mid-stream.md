# Settings-runtime-propagation cache-disable-flushes-mid-stream rubric

## Latency budgets

- `cacheEnabled` flip -> storage write: <= 200ms.
- Next sidepanel turn bypasses cache: <= 300ms after commit.

## State expectations

- Step 1: a translate is in flight; `cacheEnabled === true`.
- Step 2 (user flips `cacheEnabled` to false mid-stream): the in-flight request finishes; the flip clears the cache, so its result is not cached.
- Step 3: the NEXT sidepanel translate request bypasses the cache entirely; it always hits the backend.

## Visible affordances

- The cache toggle ("Reuse recent translations") is in Options > Translate > Cache; its help text says the cache lives in memory only.
- The Inspector shows a "Cache: Hit" row only on a hit; a bypassed request shows no "Cache" row (a "Cache-read tokens" row is the provider's prompt cache, not this one).

## Failure-mode expectations

- Disabling cache clears the whole in-memory cache (any settings write except `sitePrefs`/`theme` does).
- Re-enabling cache starts empty; entries refill from new requests.

## Cautions

- The `cacheEnabled === false` path must check the live setting at request-time; not a stale closure from session start.
- The audit log records requests, not setting changes; the next entry shows `cacheHit: false`.
