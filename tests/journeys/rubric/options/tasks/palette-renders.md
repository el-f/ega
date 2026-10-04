# Options-tasks palette-renders rubric

## Latency budgets

- Mount -> palette render: <= 200ms.

## State expectations

- Step 1: user navigates to a scope that surfaces the slot palette.
- Step 2: palette lists every per-task slot as a chip; required slots are visually distinct.
- Step 3: chips reflect the currently active task (slots vary per task).

## Visible affordances

- A required slot missing from the user template gets a danger border and a `required` badge.
- Each chip has a hover tooltip explaining what the slot binds to.

## Failure-mode expectations

- Every task lists at least the shared slots (`text`, `langLabel`, `targetLangLabel`…); there is no empty state.

## Cautions

- Chip layout must wrap cleanly on narrow surfaces — no horizontal scrollbar at default Options width.
- Clicking a chip inserts its `{{slot}}` token into the last-focused field; the `Insert variable` button opens the searchable popover.
