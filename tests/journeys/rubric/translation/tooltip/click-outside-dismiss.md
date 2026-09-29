# Tooltip click-outside-dismiss rubric

## Latency budgets

- Click outside -> tooltip unmount: <= 100ms.

## State expectations

- Step 1: tooltip is mounted with `clickOutsideDismiss === true` (default text-translate behavior).
- Step 2 (click on the page outside the tooltip): tooltip dismisses; the selection remains so the user can re-trigger.
- Step 3: the close-X control is HIDDEN in this mode (the page-click affordance replaces it).

## Visible affordances

- The dismiss target is implicit — the entire page outside the tooltip rect.
- No explicit "click outside to close" hint copy needed.

## Failure-mode expectations

- Mid-stream click-outside cancels the in-flight request (same path as Cancel).

## Cautions

- Click-outside dismissal MUST be disabled when `clickOutsideDismiss === false` (image-translate surfaces). Surfacing the close-X is then the only escape — guard the topbar gate.
- Clicks on the tooltip's own scrollbar must not count as "outside".
