# Tooltip-sidepanel-escalation cache-hit-cross-surface rubric

## Latency budgets

- Second-surface request -> cache hit served: <= 200ms.

## State expectations

- Step 1: user translates text X via the tooltip; result caches.
- Step 2: user translates the SAME text X via the sidepanel with the same source + target lang, task, tone, page context, glossary, rules and no chat history.
- Step 3: the sidepanel result lands within the cache-hit budget; `meta.cacheHit === true` in the response.

## Visible affordances

- The sidepanel Details inspector lists a "Cache: Hit" row on a hit (a row, not a badge).
- Tooltip ResultMeta does the same when the order is reversed.

## Failure-mode expectations

- A digest mismatch (any of the keyed inputs differs) -> cache miss; full backend round-trip. This is the expected behavior, not a failure.

## Cautions

- Cache parity across surfaces depends on the unified cache-key contract — see `src/background/cache.ts`.
- Changes to digest inputs (new task params, new context dimensions) must update both surfaces simultaneously.
