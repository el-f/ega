# Sidepanel scroll-containment rubric

## State expectations

- Step 1: several turns land, so the conversation is taller than the panel.
- Step 2: the conversation stream owns the scrollbar. The panel itself never scrolls.
- Step 3: the composer stays parked at the bottom, at full height, whatever the conversation length.

## Visible affordances

- The header fits on one row inside the panel width. Chrome opens the panel at 400px. Export,
  the bookmark filter, theme and the fallback budget live in the "More actions" (⋯) menu, and the
  active-backend chip is the one element that shrinks.
- The task chips wrap; past three rows they scroll inside their own box, which is not a layout
  failure.

## Failure-mode expectations

- The message box and its buttons must never paint over the task chips.
- No control may sit outside the panel box, where it cannot be clicked.

## Cautions

- `document.scrollHeight` is not a usable signal here: a hidden CSS-tooltip pseudo-element inflates
  it. Measure element rectangles against the viewport instead.
- Elements inside a horizontally scrollable strip are exempt from the "inside the panel" check.
