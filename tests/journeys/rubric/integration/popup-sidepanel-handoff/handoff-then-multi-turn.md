# Popup-sidepanel-handoff handoff-then-multi-turn rubric

## Latency budgets

- Second user send -> second assistant turn first token: warm <= 1.5s.

## State expectations

- Step 1: popup handoff seeds sidepanel; turn 1 UserTurn + AssistantTurn complete and are visible in the conversation.
- Step 2: user types a follow-up message in the composer and presses Send.
- Step 3: a second UserTurn appends below turn 1; a second AssistantTurn streams and completes. Both turn pairs render in insertion order, separated by the standard turn divider.

## Visible affordances

- Conversation scroll follows the bottom of turn 2 while it streams.
- The composer clears after Send and is re-enabled when turn 2 completes.

## Failure-mode expectations

- Second dispatch failure -> error on turn 2 assistant slot only; turn 1 is unaffected and still readable.

## Cautions

- The second dispatch must include the full prior context — the seeded turn 1 must be included in the conversation history sent to the backend.
- `lastDispatch` must update to reference turn 2 after it completes, not remain frozen at the handoff seed.
