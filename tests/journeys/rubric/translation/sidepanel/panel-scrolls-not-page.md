# Sidepanel scroll-containment rubric

## State expectations

- Step 1: several turns land, so the conversation is taller than the panel.
- Step 2: the conversation stream owns the scrollbar. The panel itself never scrolls.
- Step 3: the composer stays parked at the bottom, at its own height, whatever the conversation length.

## Visible affordances

- The header fits on one row at every width: site title, backend chip, New, Search and More. Settings, keyboard shortcuts, export and the bookmark filter live in the More menu. The site title is the one element that shrinks (with an ellipsis); under 360px the backend chip becomes a dot.
- The composer is one input with three controls (mode chip, Add, Send), about 100px tall at rest.

## Failure-mode expectations

- The message box and its buttons must never paint over the thread.
- No control may sit outside the panel box, where it cannot be clicked.

## Cautions

- `document.scrollHeight` is not a usable signal here: a hidden CSS-tooltip pseudo-element inflates it. Measure element rectangles against the viewport instead.
- Elements inside a horizontally scrollable box (a code block, a table) are exempt from the "inside the panel" check.
