# Tooltip-sidepanel-escalation escalation-then-retry rubric

## Latency budgets

- Retry button click -> new stream starts: warm <= 1.5s.

## State expectations

- Step 1: tooltip explain completes; Pin seeds sidepanel with the explain UserTurn + AssistantTurn.
- Step 2: the seeded AssistantTurn enters an error state (backend failure or forced test condition).
- Step 3 (click Retry): the same explain source input is re-dispatched via `attachedToTurnId` linkage; the assistant slot replaces the error with a new stream.

## Visible affordances

- Retry button is the primary affordance on the error pill within the seeded turn slot.
- The seeded UserTurn remains visible above the retrying assistant slot.

## Failure-mode expectations

- Re-dispatch failure -> error pill remains; retry button stays available.
- After two consecutive failures, "Try different backend" CTA surfaces on the seeded turn.

## Cautions

- `attachedToTurnId` on the retry ensures the response updates the correct turn in the conversation rather than appending a new one.
- The retry must use the explain task context carried by the original escalation payload — not a plain translate dispatch.
