# Options-audit-log filter-by-status rubric

## Latency budgets

- Status filter change -> list update: <= 100ms.

## State expectations

- Step 1: audit-log panel has rows with mixed statuses (success, error, cache).
- Step 2 (select "Error"): only error-outcome rows remain visible.
- Step 3 (switch to "Cache"): only cache-hit rows remain visible.
- Step 4 (select "All"): full list restores.

## Visible affordances

- Status is a select (All statuses, OK, Error, Cache hit) plus preset chips "Errors only", "Cache hits", "OK only".
- Active filter option uses accent tokens; inactive is neutral.
- Error rows carry a danger `error` pill, cache hits an accent `cache` pill; OK rows have no pill.

## Failure-mode expectations

- A status with zero matching entries surfaces the empty state rather than an error.
- Changing a filter keeps row expansion; expanded state is kept per entry id.

## Cautions

- Status filter is independent of task and backend filters; all three can be active simultaneously.
- Filters persist in session storage and come back on re-entry until the browser restarts.
