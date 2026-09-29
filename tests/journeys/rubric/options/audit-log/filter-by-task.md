# Options-audit-log filter-by-task rubric

## Latency budgets

- Filter chip click -> list update + count: <= 100ms.

## State expectations

- Step 1: audit-log panel has rows of mixed tasks.
- Step 2 (click a task chip): only rows matching the task remain visible; the count next to the filter updates.
- Step 3 (click "All" or the same chip again): full list restores.

## Visible affordances

- Active filter chip uses accent tokens; inactive chips are neutral.
- A count badge next to each chip ("12 matches") shows the filtered subset size.

## Failure-mode expectations

- A task with zero matches still renders its chip — but disabled with a count of 0.
- Clearing the filter restores the order (newest-first).

## Cautions

- Filter chips are mutually exclusive in this surface; multi-select would conflict with the count display.
- The filter does NOT persist across navigation; resets to "All" on re-entry.
