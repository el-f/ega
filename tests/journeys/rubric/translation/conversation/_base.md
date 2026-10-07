# Conversation surface rubric

## Turn model

- Each user message is a UserTurn; each backend reply is an AssistantTurn. Turns are ordered; a finished reply can gain versions (Regenerate, a Refine preset, "Describe a change…", Translate into, Swap, Answer again as) shown with the version pager, and turns can be bookmarked or deleted.
- "Try again" on a failed reply replaces that reply in place; Regenerate on a finished reply adds a new version beside it. Neither appends a UserTurn.
- While a reply streams, the composer's Send becomes Stop, and the header's More menu offers "Stop all requests"; a finished reply shows one action row: Copy, Regenerate, Refine and More (Read aloud, About this reply, Answer again as, Bookmark, Delete).

## Rendering

- AssistantTurn renders the answer first, then one muted meta line (direction, version, model, and confidence as text when the setting shows it), then the action row. "About this reply" opens the details under the reply: who answered, languages, time, confidence, any change, and the instructions sent.
- UserTurn renders the source text verbatim in a bubble. A task label sits above the bubble only where the task changes ("Reword · Casual"). Times live in day separators between messages, not on each message.
- While streaming, the answer is plain text with a caret; Markdown renders once the stream ends, with matching text metrics so the answer does not reflow.

## Copy semantics

- Copy on a reply places the answer in the clipboard; the meta line is not copied.
- Copy turns its icon into a check named "Copied" for about 1.5s.
