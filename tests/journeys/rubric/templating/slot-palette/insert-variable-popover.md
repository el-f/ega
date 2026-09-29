# Slot-palette insert-variable-popover rubric

## Latency budgets

- Trigger click -> popover open: <= 150ms.
- Filter typing -> result list update: <= 50ms per keystroke.

## State expectations

- Step 1: user triggers the insert-variable popover (button or keyboard shortcut).
- Step 2: popover mounts with a searchable list of available slots; type-ahead filters.
- Step 3 (select a slot): popover dismisses; the `{{slot}}` token inserts at the editor caret position.

## Visible affordances

- Popover carries a search input + keyboard-navigable result list.
- Each result row names the slot + its binding source (active task / global).

## Failure-mode expectations

- Empty query shows the full slot list; no slots configured renders an empty-state hint.

## Cautions

- The caret position must be preserved before the popover opens; insert must land at the original caret, not at the end of the textarea.
- Popover dismisses on Esc; on click-outside; on selection. All three paths exit cleanly.
