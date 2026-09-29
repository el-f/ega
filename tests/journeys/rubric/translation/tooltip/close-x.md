# Tooltip close-x rubric

## Latency budgets

- Close click -> tooltip unmount: <= 100ms.
- Esc keypress -> tooltip unmount: <= 100ms.

## State expectations

- Step 1: tooltip visible with an "x" close button in the topbar.
- Step 2 (click x): tooltip dismisses; selection remains on the page (the user can re-trigger).
- Step 3 (Esc): same behavior as the x click.

## Visible affordances

- The close button has an `aria-label="Close tooltip"` (not just `x`).
- The button hit area is at least 24x24px.

## Failure-mode expectations

- Mid-stream close cancels the request — no orphan call hits the backend. Audit log records the cancellation reason as "user".

## Cautions

- The x must NOT focus-trap the cursor inside the tooltip. After close, focus returns to the page body (or to the previously-focused element if any).
- The x must be present on image-translate tooltips regardless of `clickOutsideDismiss` — image surfaces have no other escape.
