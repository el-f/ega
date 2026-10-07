# Options-audit-log filter-by-task rubric

## Latency budgets

- Task select change -> list update + count: <= 100ms.

## State expectations

- Step 1: the Recent requests card has rows of mixed tasks.
- Step 2 (pick a task in the Task select): only rows of that task remain; the line above the list reads "N matches" with a ghost "Clear filters".
- Step 3 (pick "All", or press Clear filters): the full list restores and the line goes away.

## Visible affordances

- The Task select lists "All", every task by name (custom tasks too) and "Deleted task" for an id a row still carries.
- One "N matches" count shows the filtered subset size.

## Failure-mode expectations

- Every task is listed and selectable; one with no entries shows "No request matches these filters" with Clear filters.
- Clearing the filter restores the order (newest-first).

## Cautions

- The Task select is single-choice; it combines (AND) with the backend, status and search filters.
- Filters persist in session storage and come back on re-entry until the browser restarts.
