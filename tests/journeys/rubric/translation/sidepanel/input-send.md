# Sidepanel input-send rubric

## Latency budgets

- Send click / Enter -> user turn appended visually: <= 50ms.
- First assistant token visible: warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: composer carries the user's text.
- Step 2 (Send): composer clears; user turn appears in the conversation log; assistant turn begins streaming.
- Step 3: focus returns to the composer right after Send; when the reply lands, Stop turns back into the send button, labeled with the task (e.g. "Translate") and disabled until the box has text.

## Visible affordances

- Send button is disabled when the composer is empty or whitespace-only.
- Stop button replaces send while streaming. Stop ack within 200ms.

## Failure-mode expectations

- Send while offline -> the assistant turn shows a "Network issue" error with a Retry button; the user turn is untouched.
- Long input -> a character counter appears in the send row past 1600 chars; past 2000 Send is blocked and its tooltip names the limit, never a silent truncation.

## Cautions

- Multiple Sends in flight must not overlap; the second is queued or rejected, never both racing to the same turn.
