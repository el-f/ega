# Picker hover-outlines-target rubric

## Latency budgets

- Pointermove -> outline reposition: <= 16ms (1 frame).

## State expectations

- Step 1: picker overlay is mounted; user moves pointer over the page.
- Step 2: outline renders at the candidate element's bounding rect; updates on pointermove without flicker.
- Step 3: outline tone differs between text-eligible / image-eligible / ineligible targets (tokens, not raw colors).

## Visible affordances

- Outline carries a token-driven color + dashed/solid distinction.
- The hovered element is identified by a subtle label near the outline (tag name + role).

## Failure-mode expectations

- Hovering across an iframe boundary -> outline disappears until the pointer re-enters the parent document (cross-origin restriction).

## Cautions

- Outline render must not allocate per-frame DOM nodes — reuse a single positioned element.
- The label must NOT cover the element under the pointer; offset positioning required.
