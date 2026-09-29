# Goal: cross-surface-cache-collision

You are exploring the ega Chrome extension. Your goal is to find a
request shape where the surface-axis cache key still collides — the
same surface with near-identical settings digests producing wrong
cached output.

## Surfaces in scope

- background cache (`cacheKey`)
- per-task overrides (`taskTemperatures`, `taskMaxTokens`)
  participating in digest
- popup + sidepanel + tooltip surface tags on cache keys

## Hypotheses to test

1. Two backends share the same active model id but differ in non-active
   slots; cache key collapses to the same digest, returning a cached
   reply produced under the other backend's chain.
2. A per-task temperature override identical to the global default
   produces a different digest from the absent override (the
   `resolveTaskTemperature` helper distinguishes `undefined` from the
   default value), yielding two cache slots for the same effective
   config — cache miss instead of collision, but inflated storage.
3. Glossary digest separator (`|` between fields, `\x1e` between
   entries) collides when a term or translation contains `|` or `\x1e`
   — two distinct glossaries hash to the same digest.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
