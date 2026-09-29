# Goal: desync-active-backend-chip

You are exploring the ega Chrome extension. Your goal is to find a state
desync between the sidepanel's `ActiveBackendChip` and the actual SW
(service-worker) chain ordering produced by `resolveChainForTask`.

## Surfaces in scope

- shared `ActiveBackendChip` (sidepanel + popup mount)
- background `resolveChainForTask` + `buildBackendConfig`
- settings `backendOrder` + `taskBackends[task]` overrides

## Hypotheses to test

1. Pinning a task in popup updates `taskBackends[task]` but the chip
   subscription debounces; first translate after pin uses new chain while
   chip still renders the previous active id.
2. Disabling the currently-pinned backend leaves the chip showing the
   disabled id while the router falls through to the next non-disabled
   member of `backendOrder`.
3. `auto` resolution differs across surfaces — popup chip resolves the
   first non-disabled backend, sidepanel chip caches the previous result
   until the next `settings:update` broadcast.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
