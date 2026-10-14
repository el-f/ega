# Options-languages variety-filter rubric

## Latency budgets

- Keystroke in filter input -> list update: <= 50ms.

## State expectations

- Step 1: the variety list is fully populated (built-in + custom entries).
- Step 2: user types in the filter input; the list narrows to rows whose label contains the query (case-insensitive substring).
- Step 3: user clears the filter text; the full list restores.

## Visible affordances

- The filter shows a search icon and the "Filter languages" placeholder, and is named "Filter languages".
- No match says `No language matches "<query>"` with a ghost "Clear filter" that empties the field and puts focus back in it.

## Failure-mode expectations

- Filtering to zero results shows the empty-state message; no error.
- Clearing the filter always restores the full list in the original sort order.

## Cautions

- Filter is a local UI operation; it does NOT write to storage or modify `customLanguages`.
- Filter state is NOT persisted; it resets to empty on tab re-entry.
