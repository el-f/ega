# Conversation user-turn-render rubric

## Latency budgets

- Turn append on send: <= 50ms.

## State expectations

- Step 1: user composes text in the composer and sends.
- Step 2: a UserTurn bubble appears with the source text verbatim + a kind badge ("Translate"; Reword shows "Reword · <tone>") + a timestamp.
- Step 3: the assistant turn appears immediately below in a streaming state.

## Visible affordances

- The kind badge is read-only and reflects the task (and, for Reword, the tone) active at send.
- The bubble is positioned right-aligned (or per design convention) distinct from assistant turns.

## Failure-mode expectations

- Input over 2000 chars cannot be sent (Send disabled, "Too long — N of 2000 characters"), a sent bubble shows its full text wrapped, with no expander.
- Multi-line input renders newlines correctly (not collapsed into a single line).

## Cautions

- The UserTurn is not edited in place; its Edit button loads the text into the composer, and an older turn first confirms removing later messages.
- Right-edge clipping (CSS overflow) must not cut characters; padding tokens guard the boundary.
