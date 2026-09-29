# Conversation user-turn-render rubric

## Latency budgets

- Turn append on send: <= 50ms.

## State expectations

- Step 1: user composes text in the composer and sends.
- Step 2: a UserTurn bubble appears with the source text verbatim + task chip + tone chip.
- Step 3: the assistant turn appears immediately below in a streaming state.

## Visible affordances

- Task + tone chips are read-only display on the user turn; they reflect what was active at send.
- The bubble is positioned right-aligned (or per design convention) distinct from assistant turns.

## Failure-mode expectations

- Very long input (>4k chars) -> the bubble truncates with a "Show full" expander; full text is preserved for the request.
- Multi-line input renders newlines correctly (not collapsed into a single line).

## Cautions

- The UserTurn must NOT be editable after send — immutability is core to the conversation contract.
- Right-edge clipping (CSS overflow) must not cut characters; padding tokens guard the boundary.
