# Page-translate keyboard rubric

## State expectations

- Step 1: translate-areas mode opens with a keyboard cursor already on the first candidate block.
- Step 2: the arrow keys move the cursor between candidates. The cursor is always on screen — a
  move scrolls the block into view.
- Step 3: Space toggles the block under the cursor in and out of the selection.
- Step 4: Enter fires the selection. Escape leaves the mode without translating.

## Visible affordances

- The cursor block carries a focus indicator distinct from the selected-block outline, so "where
  am I" and "what did I pick" are never the same signal.
- The indicator meets the same contrast bar as the rest of the UI, and it survives a theme switch.

## Screen-reader expectations

- Entering the mode announces how to use it.
- A cursor move announces the block, and a toggle announces the new selection count.
- Firing announces that the translation started.

## Latency budgets

- A key press moves the cursor within one frame.

## Failure-mode expectations

- The whole flow completes with no mouse. A pointer-only path is a failure: a keyboard user who
  can enter the mode but can never select an area is worse off than one who cannot enter it.
- Focus never escapes to `<body>` while the mode is open.
