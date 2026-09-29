# Options-audit-log quick-filter-from-entry rubric

## Latency budgets

- Expand entry: <= 150ms.
- Click task chip -> filter applied + filter row scroll-anchored: <= 200ms.

## State expectations

- Step 1: user expands an audit-log entry; inside the expanded body a task quick-filter chip is visible.
- Step 2 (click the task chip): the task filter activates for that task; only matching rows remain visible.
- Step 3: the filter row scrolls into view if it was off-screen; the active task chip in the filter row carries the accent token.

## Visible affordances

- Quick-filter chip inside the expanded entry uses the project's chip style; an icon or label identifies it as a filter trigger.
- After applying, the filter row at the top of the panel scrolls into view so the user can see which filter is active.

## Failure-mode expectations

- Clicking the quick-filter chip while that task filter is already active: no-op (filter stays applied, no double-toggle).
- Scroll-anchor fails (rare): filter is still applied; the missing scroll is a visual degradation, not a functional error.

## Cautions

- Quick-filter activates the same filter mechanism as the top-of-panel filter row — the filter rows and chip stay in sync.
- The quick-filter chip must be inside the expanded body, not on the collapsed row (it would cause accidental filter activation on row click).
