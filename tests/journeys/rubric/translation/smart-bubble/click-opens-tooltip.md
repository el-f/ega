# Smart-bubble click-opens-tooltip rubric

## Latency budgets

- Bubble click -> tooltip first paint: <= 350ms.

## State expectations

- Step 1: smart bubble is mounted anchored to the user's selection.
- Step 2 (click bubble): bubble dismisses; tooltip mounts seeded with the same selection text.
- Step 3: tooltip begins streaming the translation.

## Visible affordances

- The hand-off is atomic: no intermediate "loading bubble" state. Bubble -> tooltip is one frame visually.

## Failure-mode expectations

- If the selection is gone by the time the click registers (race), the tooltip mounts with the captured-at-bubble-mount text — never empty.

## Cautions

- Bubble click must NOT propagate to underlying page elements (link clicks under the bubble).
- The tooltip inherits the bubble's anchor position; no jump on hand-off.
