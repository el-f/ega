# Goal: starve-cache-budget

You are exploring the ega Chrome extension. Your goal is to find a way the
cache misses when it should hit, or hits when it should miss, after a
settings or backend mutation.

## Surfaces in scope

- background router cache key (`cacheKey` in `src/background/cache.ts`)
- per-task reasoning effort (`taskOverrides[task].effort`)
- backend model migrations

## Hypotheses to test

1. Toggling a per-task override and reverting it doesn't restore the
   previous cache hit (digest churn beyond what's necessary).
2. Renaming a custom-language rule without changing its body changes the
   rules digest, missing the cache.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
