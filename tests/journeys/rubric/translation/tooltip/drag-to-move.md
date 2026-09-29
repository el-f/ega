# Tooltip drag-to-move rubric

## Latency budgets

- Drag-handle pointerdown -> tooltip starts following pointer: <= 16ms (1 frame).
- Drop release -> position commit: <= 100ms.

## State expectations

- Step 1: tooltip is anchored to its selection with a visible drag handle (top-row grip).
- Step 2 (pointerdown + move on handle): tooltip moves with the pointer; the rest of the content does not jitter.
- Step 3 (pointerup): tooltip stays at the dropped position until next mount.

## Visible affordances

- Drag handle uses a `cursor: grab` / `grabbing` token and carries a clear aria-label.
- A visible drop-zone outline appears only when the tooltip is being dragged.

## Failure-mode expectations

- Dragging off-screen clamps the position to the viewport (no orphan tooltip drifting beyond the edge).
- Dragging during a stream does not pause the stream; tokens keep landing.

## Cautions

- The drag must NOT trigger a re-anchor on the selection. Once dragged, position is user-controlled until close.
- Pointer capture is released cleanly on cancel (Esc during drag aborts the move).
