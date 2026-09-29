# Conversation assistant-turn-render rubric

## Latency budgets

- First-token visible in the turn: warm <= 1.5s, cold <= 4s.
- ResultMeta footer render: <= 200ms after stream completion.

## State expectations

- Step 1: assistant turn mounts as an empty bubble with a streaming indicator.
- Step 2: streamed content lands progressively into the body; markdown rendering follows the family-base contract.
- Step 3: on stream end, indicator dismisses; ResultMeta footer surfaces (backend, latency, cache-hit, model id).

## Visible affordances

- Turn carries copy + retry controls on completion (never during stream).
- Stop control replaces the streaming indicator while in flight.

## Failure-mode expectations

- Stream timeout -> the bubble surfaces a "Stream stalled" pill with retry; partial content preserved.
- ResultMeta missing (older backend response) -> footer is hidden, not rendered with placeholders.

## Cautions

- Streaming must not allocate per-token DOM nodes — a single text-content sink.
- ResultMeta must not leak sensitive fields (API keys, internal trace ids).
