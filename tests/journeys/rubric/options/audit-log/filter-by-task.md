# Options-audit-log filter-by-task rubric

## Latency budgets

- Filter chip click -> list update + count: <= 100ms.

## State expectations

- Step 1: audit-log panel has rows of mixed tasks.
- Step 2 (pick a task in the Task select): only rows of that task remain; the header shows "N matches".
- Step 3 (pick "All tasks", or click the header "N filter" pill): full list restores.

## Visible affordances

- While a filter is active the header shows an accent "N filter" pill; clicking it clears all filters.
- One "N matches" count in the header shows the filtered subset size.

## Failure-mode expectations

- Every task is listed and selectable; one with no entries shows the "No matches" empty state with Clear filters.
- Clearing the filter restores the order (newest-first).

## Cautions

- Task select is single-choice; it combines (AND) with backend, status and query filters.
- Filters persist in session storage and come back on re-entry until the browser restarts.
