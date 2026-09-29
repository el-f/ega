# Sidepanel stream-tokens rubric

## Latency budgets

- First token visible: warm <= 1.5s, cold <= 4s.
- Per-token render delay: <= 16ms (smooth animation frame).
- End-of-stream detection -> "done" affordance: <= 200ms.

## State expectations

- Step 1: assistant turn appears as an empty bubble with a typing/streaming indicator.
- Step 2: tokens land progressively; the bubble grows; the page does NOT scroll back to top mid-stream.
- Step 3: stream completes; indicator disappears; copy + retry controls become available on that turn.

## Visible affordances

- Stop control is visible throughout the stream.
- Token count or progress indicator (subtle) for long streams (>500 tokens).

## Failure-mode expectations

- Mid-stream disconnect surfaces a "Connection lost" inline pill with a retry control; the partial text is preserved.
- The assistant turn never freezes silently. Either tokens land OR an error appears within 10s.

## Cautions

- Streaming must not allocate per-token DOM nodes (perf). Use a single text-content target.
- Markdown formatting renders post-stream OR progressively but consistently — not "stream raw then snap to formatted".
