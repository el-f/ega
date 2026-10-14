# Conversation user-turn-render rubric

## Latency budgets

- Turn append on send: <= 50ms.

## State expectations

- Step 1: the user types in the composer and sends.
- Step 2: a message bubble appears with the source text verbatim. A first message under Translate names no task; a message whose task differs from the one before shows a task label above the bubble ("Reword"; a non-Neutral tone is added: "Reword · Casual").
- Step 3: the reply appears below it in its loading state.

## Visible affordances

- The task label is read-only and reflects the task (and tone) the message went out with.
- The bubble sits at the end of the row (right in LTR), distinct from replies, which have no box.
- Hover or focus shows the message toolbar (Copy, Edit, More) floating over the bubble's edge; nothing moves.

## Failure-mode expectations

- Input over the cap cannot be sent (the count line says how many characters are too many); a sent bubble shows its full text wrapped, with no expander. A trimmed message says "Only the first N characters were sent."
- Multi-line input renders newlines correctly (not collapsed into a single line).

## Cautions

- A message is not edited in place: Edit loads its text into the composer ("Editing your message"); "Edit from here" on an older message names how many later messages it removes.
- Right-edge clipping (CSS overflow) must not cut characters; padding tokens guard the boundary.
