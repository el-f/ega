# Options-audit-log filter-by-status rubric

## Latency budgets

- Status filter change -> list update: <= 100ms.

## State expectations

- Step 1: audit-log panel has rows with mixed statuses (success, error, cache).
- Step 2 (select "Error"): only error-outcome rows remain visible.
- Step 3 (switch to "Cache"): only cache-hit rows remain visible.
- Step 4 (select "All"): full list restores.

## Visible affordances

- Status filter uses a dropdown or chip group with options: All, Success, Error, Cache.
- Active filter option uses accent tokens; inactive is neutral.
- Each row's outcome tone matches the status (red for error, green for success, muted for cache).

## Failure-mode expectations

- A status with zero matching entries surfaces the empty state rather than an error.
- Switching between status options clears any active row expansion (expanded row from a different status would be stale).

## Cautions

- Status filter is independent of task and backend filters; all three can be active simultaneously.
- The filter does NOT persist across navigation; resets to "All" on re-entry.
