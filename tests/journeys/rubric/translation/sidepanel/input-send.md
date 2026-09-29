# Sidepanel input-send rubric

## Latency budgets

- Send click / Enter -> user turn appended visually: <= 50ms.
- First assistant token visible: warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: composer carries the user's text.
- Step 2 (Send): composer clears; user turn appears in the conversation log; assistant turn begins streaming.
- Step 3: composer regains focus once the assistant turn lands; send button re-enables.

## Visible affordances

- Send button is disabled when the composer is empty or whitespace-only.
- Stop button replaces send while streaming. Stop ack within 200ms.

## Failure-mode expectations

- Send while offline -> inline error on the user turn ("Couldn't reach backend") with a retry control on the assistant turn slot.
- Long input (>4k chars) -> a hint surface above the composer naming the limit, not a silent truncation.

## Cautions

- Multiple Sends in flight must not overlap; the second is queued or rejected, never both racing to the same turn.
