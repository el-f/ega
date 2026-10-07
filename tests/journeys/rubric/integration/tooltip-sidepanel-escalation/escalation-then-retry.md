# Tooltip-sidepanel-escalation escalation-then-retry rubric

## Latency budgets

- "Try again" click -> new stream starts: warm <= 1.5s.

## State expectations

- Step 1: tooltip translate fails; user clicks "Continue in side panel"; the side panel re-sends the source text as a new UserTurn.
- Step 2: the seeded AssistantTurn enters an error state (backend failure or forced test condition).
- Step 3 (click "Try again"): the user turn's source text and task are re-sent; a new assistant turn replaces the failed one in place (same `attachedToTurnId`) and streams.

## Visible affordances

- "Try again" is the first (outlined) button in the seeded reply's error row.
- The seeded UserTurn remains visible above the retrying assistant slot.

## Failure-mode expectations

- Re-dispatch failure -> the error stays; "Try again" stays available.
- After a second failure on the same reply, "Open settings" shows beside "Try again".

## Cautions

- `attachedToTurnId` on the retry ensures the response updates the correct turn in the conversation rather than appending a new one.
- The retry re-sends the user turn's own task (a plain translate here) and keeps any pinned explanation on the new slot.
