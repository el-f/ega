# Options-audit-log filter-by-status rubric

## Latency budgets

- Status filter change -> list update: <= 100ms.

## State expectations

- Step 1: the Recent requests card has rows with mixed statuses (OK, error, cache).
- Step 2 (pick "Errors"): only error rows remain; the line reads "1 match".
- Step 3 (switch to "From cache"): only cache-hit rows remain.
- Step 4 (pick "All"): the full list restores.

## Visible affordances

- Status is the first select in the one filter row: All, OK, Errors, From cache. There are no preset chips.
- Error rows read the shared error title in the danger color; cache hits read "From cache"; OK rows read "OK".

## Failure-mode expectations

- A status with zero matching entries shows "No request matches these filters" with Clear filters rather than an error.
- Changing a filter keeps open rows open; open state is kept per entry id.

## Cautions

- The Status filter is independent of the task and backend filters; all three can be active together.
- Filters persist in session storage and come back on re-entry until the browser restarts.
