# Tooltip surface rubric

## Mount + position

- Selection bubble appears within 200ms of selection-change.
- Tooltip mounts within 350ms of bubble click.
- Tooltip never overflows the viewport; auto-flips when within 16px of an edge.

## Close affordances

- Esc closes the tooltip without losing the selection.
- Click-outside closes the tooltip unless `clickOutsideDismiss` is explicitly disabled (image-translate surfaces).
- A top-row "x" close is visible when `clickOutsideDismiss` is off OR when the tooltip carries an image.

## Latency

- First token visible within 1.5s for cached / warm-CLI paths.
- Cold cloud paths show a progress shimmer within 400ms of mount.
