# Conversation copy-assistant-turn rubric

## Latency budgets

- Copy click -> clipboard ack: <= 200ms.

## State expectations

- Step 1: the reply is finished, with Copy first in its action row.
- Step 2 (click Copy): the clipboard holds the answer only — NOT the meta line, NOT the message's task label.
- Step 3: the Copy icon turns into a check named "Copied" within 100ms and turns back after ~1.5s; screen readers hear "Copied".

## Visible affordances

- Copy is a 28px icon button named "Copy" ("Copied" after a click), with a matching tooltip.
- During the stream there is no Copy in the row; the row's space is reserved.

## Failure-mode expectations

- A refused clipboard write -> the meta line says so for a moment; the icon stays Copy.

## Cautions

- Copy places the answer as the model wrote it (Markdown source, no rendered HTML); the notes block is not copied.
- Copy keeps focus on the button; it is a side effect, not a navigation.
