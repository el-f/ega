# Options-audit-log filter-by-backend rubric

## Latency budgets

- Backend dropdown change -> list update: <= 100ms.

## State expectations

- Step 1: audit-log panel has rows from multiple backends.
- Step 2 (select a backend in the dropdown): only rows matching that backend remain visible.
- Step 3 (select "All" / clear filter): full list restores.

## Visible affordances

- Backend filter is a dropdown or select control labeled "Backend".
- The dropdown lists every registered backend plus `auto` and `unknown`, with or without entries.

## Failure-mode expectations

- A backend that has no entries in the current log is still selectable; selecting it shows the empty state.
- Clearing the filter restores the order (newest-first).

## Cautions

- Backend filter is independent of the task filter; both can be active simultaneously (AND logic).
- Filters persist in session storage and come back on re-entry until the browser restarts.
