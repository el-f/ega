# Options-audit-log quick-filter-from-entry rubric

## Latency budgets

- Expand entry: <= 150ms.
- Click task chip -> filter applied + filter row scroll-anchored: <= 200ms.

## State expectations

- Step 1: each collapsed row's task cell is a button ("Filter by this task"); no expansion needed.
- Step 2 (click the task chip): the task filter activates for that task; only matching rows remain visible.
- Step 3: the filter row scrolls into view if it was off-screen; the Task select shows the chosen task and the header shows an accent "1 filter" pill.

## Visible affordances

- The row's task and backend cells are filter triggers: accent on hover, titled "Filter by this task" / "Filter by this backend".
- After applying, the filter row at the top of the panel scrolls into view so the user can see which filter is active.

## Failure-mode expectations

- Clicking the quick-filter chip while that task filter is already active: no-op (filter stays applied, no double-toggle).
- Scroll-anchor fails (rare): filter is still applied; the missing scroll is a visual degradation, not a functional error.

## Cautions

- Quick-filter activates the same filter mechanism as the top-of-panel filter row — the filter rows and chip stay in sync.
- Quick-filter cells (task, backend) sit on the collapsed row; only the timestamp and latency areas toggle expansion.
