# Tooltip inspector-drawer rubric

## Latency budgets

- Inspector trigger -> drawer open: <= 200ms.
- Drawer close: <= 150ms.

## State expectations

- Step 1: tooltip is finalized; an ⓘ "Details" button (aria-label "Show inspector") shows in the action row once meta lands (`captureResultMeta` on).
- Step 2 (click): a "Details" panel expands below the action row with rows Backend, Model, Cache (hit only), Direction, First token, Total time and token counts.
- Step 3 (close via the ⓘ toggle or the panel's X "Close details"): the panel collapses; the body is unchanged.

## Visible affordances

- Esc closes the whole tooltip; the drawer itself closes via its X button or the ⓘ toggle.
- Each ResultMeta row carries a label + value; numeric values use the project's number formatting tokens.

## Failure-mode expectations

- Error results show no inspector button; meta is set only on a successful finish.

## Cautions

- The drawer must NOT cover the close-X — both must remain reachable.
- ResultMeta must NOT leak the raw API key or sensitive request headers.
