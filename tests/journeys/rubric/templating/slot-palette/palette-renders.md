# Slot-palette palette-renders rubric

## Latency budgets

- Mount -> palette render: <= 200ms.

## State expectations

- Step 1: user navigates to a scope that surfaces the slot palette.
- Step 2: palette lists every per-task slot as a chip; required slots are visually distinct.
- Step 3: chips reflect the currently active task (slots vary per task).

## Visible affordances

- Required slots carry an asterisk + warning tone token.
- Each chip has a hover tooltip explaining what the slot binds to.

## Failure-mode expectations

- A task with zero slots renders an empty-state line, not an empty rail.

## Cautions

- Chip layout must wrap cleanly on narrow surfaces — no horizontal scrollbar at default Options width.
- Slot chips are read-only displays; click invokes the insert-variable popover (separate action).
