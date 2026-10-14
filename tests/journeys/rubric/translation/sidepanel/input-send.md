# Sidepanel input-send rubric

## Latency budgets

- Enter / Send click -> message appended visually: <= 50ms.
- First reply token visible: warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: the composer holds the user's text.
- Step 2 (Enter or Send): the composer clears; the message appears in the thread; the reply starts with a skeleton and "Translating…" in its meta slot.
- Step 3: focus stays in the composer after the send; while the reply runs, Send turns into Stop, and back into Send when the reply lands.

## Visible affordances

- Send is a 32px icon button named "Send"; on an empty box it has `aria-disabled` and the description "Type a message first".
- Stop replaces Send while a reply runs. Stop ack within 200ms.

## Failure-mode expectations

- Send while offline -> the reply shows "No connection" with "Try again"; the message is untouched.
- Long input -> a count line appears under the box past 80% of the cap; past the cap it says how many characters are too many and Send stays unavailable, never a silent cut.

## Cautions

- Sends never overlap: Enter while a reply runs sends nothing and says "Wait for this reply, or press Stop."
