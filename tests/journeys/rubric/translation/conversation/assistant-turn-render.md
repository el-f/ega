# Conversation assistant-turn-render rubric

## Latency budgets

- First token visible in the reply: warm <= 1.5s, cold <= 4s.
- Meta line render: <= 200ms after stream completion.

## State expectations

- Step 1: the reply mounts with three static skeleton bars and "Translating…" in its meta slot; the action row's 28px is reserved.
- Step 2: streamed content lands progressively as plain text with a caret.
- Step 3: on stream end, the caret goes and Markdown renders; the meta line fills in (direction, model, and "87% confident" last when the confidence setting shows it), and the action row appears: Copy, Regenerate, Refine and More. More → "About this reply" opens the details: backend, model, cache hit, time and the instructions sent.

## Visible affordances

- Copy, Regenerate, Refine and More appear only on completion (never during the stream).
- While in flight, the composer's Send becomes Stop; the reply keeps its caret.

## Failure-mode expectations

- Stream stall -> the reply becomes a "No answer in time" error with "Try again"; the panel's reason ("The reply stopped arriving. Send it again.") sits under Details. Partial text stays, with its own Copy, and the meta line says "Partial answer".
- No ResultMeta (an older backend response) -> the meta line has no model; About says the details were not recorded. No placeholder rows.

## Cautions

- Streaming must not allocate per-token DOM nodes — a single text-content sink.
- ResultMeta must not leak sensitive fields (API keys, internal trace ids).
