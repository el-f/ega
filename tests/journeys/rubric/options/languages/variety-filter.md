# Options-languages variety-filter rubric

## Latency budgets

- Keystroke in filter input -> list update: <= 50ms.

## State expectations

- Step 1: the variety list is fully populated (built-in + custom entries).
- Step 2: user types in the filter input; the list narrows to rows whose label matches the query (case-insensitive substring or fuzzy).
- Step 3: user clears the filter (backspace to empty or X button); the full list restores.

## Visible affordances

- Filter input has a clear (X) button that appears when non-empty.
- A result count ("5 of 40") is shown next to or below the input when filtered.
- An empty-state message appears when no varieties match the query.

## Failure-mode expectations

- Filtering to zero results shows the empty-state message; no error.
- Clearing the filter always restores the full list in the original sort order.

## Cautions

- Filter is a local UI operation; it does NOT write to storage or modify `customLanguages`.
- Filter state is NOT persisted; it resets to empty on tab re-entry.
