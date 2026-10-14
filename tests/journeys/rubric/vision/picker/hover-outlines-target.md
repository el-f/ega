# Picker hover-outlines-target rubric

## Latency budgets

- Pointermove -> outline reposition: <= 16ms (1 frame).

## State expectations

- Step 1: picker overlay is mounted; user moves pointer over the page.
- Step 2: outline renders at the candidate element's bounding rect; updates on pointermove without flicker.
- Step 3: one outline style for every pickable target; hovering a non-pickable target (sensitive field, Ega's own UI) hides the outline.

## Visible affordances

- Outline is a solid 2px `--color-accent` border with `--color-accent-bg-hover` fill (tokens only).

## Failure-mode expectations

- Hovering across an iframe boundary -> outline disappears until the pointer re-enters the parent document (cross-origin restriction).

## Cautions

- Outline render must not allocate per-frame DOM nodes — reuse a single positioned element.
