# Popup-sidepanel-handoff handoff-then-retry rubric

## Latency budgets

- "Try again" click -> new stream starts: warm <= 1.5s.

## State expectations

- Step 1: popup handoff seeds a UserTurn; the assistant turn stream enters an error state (backend failure).
- Step 2: the reply shows the error with "Try again" in its error row.
- Step 3 (click "Try again"): the same source content from the seeded UserTurn is re-dispatched; the assistant slot replaces the error with a new stream.

## Visible affordances

- "Try again" is the first (outlined) button in the error row.
- The UserTurn content (seeded from handoff) is still visible above the error slot.

## Failure-mode expectations

- Repeated failure -> from the second failure on the same reply the error row adds "Open settings".
- The handoff slot is already cleared before the retry fires — retry reads the user turn's own `dispatch` (falls back to `lastDispatch`), never `ega.pendingPopupHandoff`.

## Cautions

- Retry must re-dispatch using the same content and settings as the original seeded turn, not a stale cached version from the storage slot.
- Each failed retry bumps the turn's `retries` count; the only escalation is the "Open settings" button.
