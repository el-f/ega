# Side panel composer enter-sends rubric

## Latency budgets

- Enter -> message appended: <= 50ms.
- First reply token visible: warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: on an empty box Send has `aria-disabled` and the description "Type a message first"; Enter sends nothing.
- Step 2: Shift+Enter adds a line and sends nothing.
- Step 3 (Enter): the message is appended, the box clears and keeps focus, and the reply starts.
- Step 4: Ctrl+Enter (Cmd+Enter on Mac) sends too.

## Visible affordances

- Send is a 32px icon button named "Send" with the tooltip "Send (Enter)"; while a reply runs the same button is "Stop".
- Enter during IME composition never sends.

## Failure-mode expectations

- Enter while a reply runs sends nothing and says "Wait for this reply, or press Stop."

## Cautions

- A message over the length cap is never cut silently: the count line shows how many characters are too many and Send stays unavailable.
