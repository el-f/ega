# Options-audit-log filter-by-backend rubric

## Latency budgets

- Backend select change -> list update: <= 100ms.

## State expectations

- Step 1: the Recent requests card has rows from multiple backends.
- Step 2 (pick a backend in the Backend select): only rows matching that backend remain; the line above the list reads "1 match" (or "N matches") with "Clear filters".
- Step 3 (pick "All", or press Clear filters): the full list restores.

## Visible affordances

- The Backend select is labelled "Backend" and lists "All", every registered backend by name (Anthropic, Gemini...), and "Ega (no backend)" for rows no backend answered.

## Failure-mode expectations

- A backend that has no entries in the current log is still selectable; picking it shows "No request matches these filters" with Clear filters.
- Clearing the filter restores the order (newest-first).

## Cautions

- The Backend filter is independent of the task filter; both can be active together (AND logic).
- Filters persist in session storage and come back on re-entry until the browser restarts.
