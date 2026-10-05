# Conversation assistant-turn-render rubric

## Latency budgets

- First-token visible in the turn: warm <= 1.5s, cold <= 4s.
- ResultMeta footer render: <= 200ms after stream completion.

## State expectations

- Step 1: assistant turn mounts with a skeleton: a task label (e.g. "Translating…") and a shimmer bar.
- Step 2: streamed content lands progressively as plain text with a blinking caret.
- Step 3: on stream end, the caret goes and Markdown renders; the confidence, language and backend pills appear beside the time, and the action row appears (Copy, Regenerate, Info, and a More (⋯) menu holding Bookmark and Delete); Info opens a Details drawer with backend, model, cache hit and latency.

## Visible affordances

- Turn carries Copy + Regenerate controls on completion (never during stream).
- While in flight, the composer Send button becomes Stop and the header shows Cancel all requests; the turn keeps its caret.

## Failure-mode expectations

- Stream stall -> the turn becomes a "Timed out" error ("The reply stopped arriving. Send it again.") with Retry; partial text stays, marked "(partial)" with a copy button.
- ResultMeta missing (older backend response) -> the Info button and Details drawer are absent; no placeholder rows.

## Cautions

- Streaming must not allocate per-token DOM nodes — a single text-content sink.
- ResultMeta must not leak sensitive fields (API keys, internal trace ids).
