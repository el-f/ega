# Popup-sidepanel-handoff warm-handoff-then-refine rubric

## Latency budgets

- Warm handoff message received -> turn appended to conversation: <= 300ms.
- Refine chip click -> variant stream starts: <= 1.5s.

## State expectations

- Step 1: sidepanel is already open (warm). Popup writes an entry to `ega.pendingPopupHandoff` in `chrome.storage.session`; no runtime message is sent.
- Step 2: sidepanel sees the write via `storage.onChanged` (session area) and drains the slot; the new UserTurn + AssistantTurn append WITHOUT sidepanel remount.
- Step 3: after the delivered turn completes, refine chips render; user clicks a chip; a variant AssistantTurn spawns in place.

## Visible affordances

- No flash or remount on warm delivery — the turn appends smoothly below any prior conversation.
- Refine chips appear only after the warm-delivered turn reaches the done state.

## Failure-mode expectations

- A missed warm drain -> the entry stays queued and the next sidepanel mount drains it, if under 60s old.
- Refine failure on the warm-delivered turn -> same inline error behavior as a normally-sent turn.

## Cautions

- Warm handoff must NOT clear the sidepanel's existing conversation turns — it appends, not replaces.
- The warm-delivered turn must seed `lastDispatch` correctly so the subsequent refine request carries the right source input.
- The warm path is a storage round-trip: the sidepanel reads and clears `ega.pendingPopupHandoff` on `storage.onChanged`.
