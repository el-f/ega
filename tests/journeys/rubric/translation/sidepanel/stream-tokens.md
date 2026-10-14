# Sidepanel stream-tokens rubric

## Latency budgets

- First token visible: warm <= 1.5s, cold <= 4s.
- Per-token render delay: <= 16ms (smooth animation frame).
- End-of-stream detection -> the action row: <= 200ms.

## State expectations

- Step 1: the reply appears with three static skeleton bars and "Translating…" in its meta slot.
- Step 2: tokens land progressively as plain text with a caret; the thread follows the reply while its top stays in view, and never jumps back to the top.
- Step 3: the stream completes; the caret goes, Markdown renders, and Copy, Regenerate, Refine and More appear in the reserved row (nothing moves).

## Visible affordances

- Send turns into Stop for the whole stream.

## Failure-mode expectations

- A mid-stream disconnect shows the error with "Try again"; the partial text stays above it, and the meta line says "Partial answer".
- The reply never freezes silently. Either tokens land or an error appears within the stall budget.

## Cautions

- Streaming must not allocate per-token DOM nodes (perf). Use a single text-content target.
- Streaming text renders plain; Markdown formatting applies once the stream completes.
