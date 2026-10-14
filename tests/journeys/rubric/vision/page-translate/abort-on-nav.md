# Page-translate abort-on-nav rubric

## Latency budgets

- `pagehide` / `beforeunload` -> cancel dispatched: synchronous within the unload tick.

## State expectations

- Step 1: a v2 batch is in flight with registered router requests.
- Step 2: the user navigates away or closes the tab; `beforeunload` (and `pagehide` for cross-origin nav) fires.
- Step 3: the active session aborts, reverts mounted blocks, and sends `translate:cancel` for every in-flight request.

## Visible affordances

- None expected at unload time — the value is invisible: no orphaned server-side streams burning tokens after the page is gone.

## Failure-mode expectations

- If the teardown hook never ran, the router's controllers would run to their 60s wall-clock cap, spending tokens for a page no one is reading (D7).

## Cautions

- Both `beforeunload` and `pagehide` must be wired — some browsers skip `beforeunload` on cross-origin navigation.
- Teardown must be idempotent: a double-fire (both events) must not throw.
