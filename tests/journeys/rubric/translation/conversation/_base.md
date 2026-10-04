# Conversation surface rubric

## Turn model

- Each user message is a UserTurn; each backend reply is an AssistantTurn. Turns are ordered; a finished reply can gain variants (Regenerate, refine, swap, Re-run as) shown with prev/next, and turns can be bookmarked or deleted.
- Retry on a failed reply replaces that reply in place; Regenerate on a finished reply adds a new variant beside it. Neither appends a UserTurn.
- While a reply streams, the composer Send button becomes Stop and the header shows Cancel all requests; a finished reply shows Copy, Regenerate, Bookmark, Details and Delete.

## Rendering

- AssistantTurn renders streamed content progressively; once done, an Info button opens a Details drawer with ResultMeta (backend, model, cache hit, latency, tokens).
- UserTurn renders the source text verbatim plus a kind badge (task label; Reword adds its tone, e.g. "Reword · Neutral") and a timestamp.
- While streaming, the body is plain text with a caret; Markdown renders once the stream ends, with matching text metrics so the body does not reflow.

## Copy semantics

- Copy on an AssistantTurn places the translation in the clipboard; the surrounding ResultMeta is not copied.
- Copy provides visible feedback (icon flash / inline pill) within 200ms.
