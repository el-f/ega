# Popup-sidepanel-handoff warm-handoff-then-refine rubric

## Latency budgets

- Warm handoff message received -> turn appended to conversation: <= 300ms.
- Refine chip click -> variant stream starts: <= 1.5s.

## State expectations

- Step 1: sidepanel is already open (warm). Popup writes `pendingPopupHandoff` and sends a `chrome.runtime` message.
- Step 2: sidepanel receives the warm-handoff message via `storage.onChanged` or runtime message; the new UserTurn + AssistantTurn append to the existing conversation WITHOUT sidepanel remount.
- Step 3: after the delivered turn completes, refine chips render; user clicks a chip; a variant AssistantTurn spawns in place.

## Visible affordances

- No flash or remount on warm delivery — the turn appends smoothly below any prior conversation.
- Refine chips appear only after the warm-delivered turn reaches the done state.

## Failure-mode expectations

- Warm message delivery failure -> falls back to cold-start on next sidepanel focus (slot still in storage).
- Refine failure on the warm-delivered turn -> same inline error behavior as a normally-sent turn.

## Cautions

- Warm handoff must NOT clear the sidepanel's existing conversation turns — it appends, not replaces.
- The warm-delivered turn must seed `lastDispatch` correctly so the subsequent refine request carries the right source input.
- No storage round-trip needed for the warm path; the runtime message payload carries the data directly.
