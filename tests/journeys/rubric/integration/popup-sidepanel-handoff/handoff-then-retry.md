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

- Repeated failure -> from the second consecutive failure the error row adds a "Check your backends" button (opens Settings -> Backends).
- The handoff slot is already cleared before the retry fires — retry reads the user turn's own `dispatch` (falls back to `lastDispatch`), never `ega.pendingPopupHandoff`.

## Cautions

- Retry must re-dispatch using the same content and settings as the original seeded turn, not a stale cached version from the storage slot.
- Each failed retry bumps the turn's `retries` count; the only escalation is the "Check your backends" button.
