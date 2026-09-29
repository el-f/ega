# Tooltip inspector-drawer rubric

## Latency budgets

- Inspector trigger -> drawer open: <= 200ms.
- Drawer close: <= 150ms.

## State expectations

- Step 1: tooltip is in a finalized state; inspector affordance (info icon / chevron) is visible in topbar or footer.
- Step 2 (click): drawer slides in from the side of the tooltip body, revealing `ResultMeta` (backend, latency, cache-hit, model id).
- Step 3 (close): drawer dismisses; tooltip body returns to full width.

## Visible affordances

- Drawer is keyboard-dismissable (Esc closes only the drawer, not the tooltip).
- Each ResultMeta row carries a label + value; numeric values use the project's number formatting tokens.

## Failure-mode expectations

- Inspector on an error result still surfaces the metadata it has (which backend attempted, latency until failure).

## Cautions

- The drawer must NOT cover the close-X — both must remain reachable.
- ResultMeta must NOT leak the raw API key or sensitive request headers.
