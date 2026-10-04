# Tooltip close-button-follows-click-outside rubric

## Latency budgets

- Shortcut press -> tooltip dialog mounted: <= 1000ms with a mocked backend.

## State expectations

- Step 1 (`tooltipClickOutside` on): the tooltip opens with no ✕ close button; a click outside the tooltip dismisses it.
- Step 2 (`tooltipClickOutside` off): the tooltip opens with the ✕ close button in its header.

## Visible affordances

- Exactly one dismiss path is offered at a time for a text tooltip: click-outside or the ✕, never both; an image tooltip shows the ✕ regardless, alongside click-outside whenever that setting is still on.
- The ✕ is a real button with the accessible name "Close".

## Failure-mode expectations

- An error state adds no extra close control; the topbar ✕ (present or not) is unaffected by loading/error/success mode.

## Cautions

- The setting is global (Settings → Translate), not per site.
