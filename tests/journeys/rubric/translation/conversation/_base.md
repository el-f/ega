# Conversation surface rubric

## Turn model

- Each user message is a UserTurn; each backend reply is an AssistantTurn. Turns are ordered, immutable once finalized.
- Retry replaces the last AssistantTurn in-place; it never appends a new UserTurn.
- Streaming turns expose a stop affordance; finalized turns expose copy + retry.

## Rendering

- AssistantTurn renders streamed content progressively; ResultMeta (backend, latency, cache-hit) lands once the stream completes.
- UserTurn renders the source text verbatim plus the active task + tone chips.
- Markdown formatting either streams progressively or commits at end-of-stream — no raw-then-snap flip.

## Copy semantics

- Copy on an AssistantTurn places the translation in the clipboard; the surrounding ResultMeta is not copied.
- Copy provides visible feedback (icon flash / inline pill) within 200ms.
