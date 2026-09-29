# Recipes-gallery filter-by-task rubric

## Latency budgets

- Filter chip click -> gallery re-render: <= 100ms.

## State expectations

- Step 1: gallery shows all task groups by default.
- Step 2 (click a task filter chip): only the matching task's group remains visible; other groups collapse.
- Step 3 (click the chip again or "All"): full gallery restores.

## Visible affordances

- Active filter chip uses the accent tokens; inactive chips are neutral.
- A count next to each chip indicates how many recipes match.

## Failure-mode expectations

- A filter with zero matches (rare) surfaces an empty-state row, not a collapsed group with no content.

## Cautions

- Filter chips are mutually exclusive in this surface — multi-select would conflict with the grouped layout.
- Filter selection does NOT persist across navigation; resets to "All" on re-entry.
