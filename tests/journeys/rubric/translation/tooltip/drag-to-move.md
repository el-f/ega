# Tooltip drag-to-move rubric

## Latency budgets

- Drag-handle pointerdown -> tooltip starts following pointer: <= 16ms (1 frame).
- Drop release -> position commit: <= 100ms.

## State expectations

- Step 1: with `tooltipDraggable` on (default off), the tooltip shows a 6px drag gutter with three dots along its left edge.
- Step 2 (pointerdown + move on handle): tooltip moves with the pointer; the rest of the content does not jitter.
- Step 3 (pointerup): tooltip stays at the dropped position until next mount.

## Visible affordances

- Drag handle uses a `cursor: grab` / `grabbing` token and carries a clear aria-label.
- While dragging, the gutter gets a soft accent background and its dots turn accent; no drop-zone outline.

## Failure-mode expectations

- Dragging does not clamp to the viewport; the tooltip can be dragged past the edge.
- Dragging during a stream does not pause the stream; tokens keep landing.

## Cautions

- Dragging adds an offset to the anchored position; on scroll or resize the tooltip still follows the selection, keeping that offset.
- Pointer capture is released cleanly on cancel (Esc during drag aborts the move).
