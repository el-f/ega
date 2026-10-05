# Options-translate cache-disable rubric

## Latency budgets

- Checkbox toggle -> storage write: <= 200ms.

## State expectations

- Step 1: `cacheEnabled` is true (default); the cache toggle is checked.
- Step 2 (uncheck): `cacheEnabled` writes `false` to storage; subsequent translates bypass the cache layer.
- Step 3 (re-check): `cacheEnabled` writes `true`; cache is active again for new translates.

## Visible affordances

- Checkbox labeled "Reuse recent translations" in the "Streaming and cache" card (up to 5 minutes, 500 entries); a muted hint says the cache is memory-only and clears when Chrome stops Ega's background worker.
- No confirm is required — disabling is low risk and easily reversible.

## Failure-mode expectations

- Storage write failure surfaces an inline error toast; checkbox reverts to last persisted value.
- Disabling cache mid-stream does NOT cancel in-flight translates; the next request bypasses the cache.

## Cautions

- Disabling cache does NOT clear existing cached entries — it only stops new reads/writes.
- The setting takes effect on the next translate dispatch, not retroactively.
