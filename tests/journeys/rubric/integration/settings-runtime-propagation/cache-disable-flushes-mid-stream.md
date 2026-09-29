# Settings-runtime-propagation cache-disable-flushes-mid-stream rubric

## Latency budgets

- `cacheEnabled` flip -> storage write: <= 200ms.
- Next sidepanel turn bypasses cache: <= 300ms after commit.

## State expectations

- Step 1: a translate is in flight; `cacheEnabled === true`.
- Step 2 (user flips `cacheEnabled` to false mid-stream): the in-flight request finishes; the result may or may not cache (depending on flag-read timing).
- Step 3: the NEXT sidepanel translate request bypasses the cache entirely; it always hits the backend.

## Visible affordances

- The cache toggle is in Options > Diagnostics; carries an explanatory hint.
- Subsequent ResultMeta shows "Cache: off" or similar.

## Failure-mode expectations

- Disabling cache mid-stream does NOT flush the existing cache. The cache stays; it's just not consulted for the next request.
- Re-enabling cache reads from the existing entries — no rebuild required.

## Cautions

- The `cacheEnabled === false` path must check the live setting at request-time; not a stale closure from session start.
- Disabling cache is an audit-log-worthy setting change; the next entry shows the cache state.
