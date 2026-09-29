# Tooltip keyboard-esc rubric

## Latency budgets

- Esc keypress -> tooltip unmount: <= 100ms.

## State expectations

- Step 1: tooltip is mounted (any state — loading, success, error).
- Step 2 (press Esc): tooltip dismisses; the selection remains so the user can re-trigger.
- Step 3: focus returns to the element that held it before the tooltip mounted.

## Visible affordances

- The tooltip carries `role="dialog"` (or comparable) so screen readers announce Esc as a dismiss affordance.

## Failure-mode expectations

- Esc mid-stream cancels the in-flight request via the shared cancel path.
- Esc inside an inline input field (e.g., the language picker combobox) closes the inner combobox FIRST, not the tooltip.

## Cautions

- Esc must NOT bubble beyond the tooltip — it should not dismiss any underlying page modals.
- Tab order must not trap the user; Esc is the canonical escape but Tab+Shift+Tab also exit the tooltip.
