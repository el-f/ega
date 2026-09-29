# Popup-sidepanel-handoff handoff-then-retry rubric

## Latency budgets

- Retry button click -> new stream starts: warm <= 1.5s.

## State expectations

- Step 1: popup handoff seeds a UserTurn; the assistant turn stream enters an error state (backend failure).
- Step 2: the error state renders an inline Retry button on the assistant slot.
- Step 3 (click Retry): the same source content from the seeded UserTurn is re-dispatched; the assistant slot replaces the error with a new stream.

## Visible affordances

- Retry button is the primary affordance on the error pill.
- The UserTurn content (seeded from handoff) is still visible above the error slot.

## Failure-mode expectations

- Repeated retry failure -> "Try different backend" CTA surfaces after two consecutive failures.
- The handoff slot is already cleared before the retry fires — retry reads from `lastDispatch`, not from `pendingPopupHandoff`.

## Cautions

- Retry must re-dispatch using the same content and settings as the original seeded turn, not a stale cached version from the storage slot.
- The retry count for this turn must increment properly; the exhaustion path can offer escalation to sidepanel conversation mode if needed.
