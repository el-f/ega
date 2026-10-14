# Popup-sidepanel-handoff freeform-warm-handoff rubric

## Latency budgets

- Send-to-panel click -> sidepanel UserTurn render: <= 400ms (warm; no cold-start cost).

## State expectations

- Step 1: sidepanel is ALREADY open. User types in popup freeform; clicks Send-to-panel.
- Step 2: popup queues the entry under `ega.pendingPopupHandoff` (storage.session); popup closes; the open sidepanel drains it on `storage.onChanged`.
- Step 3: a new UserTurn appears in the existing conversation; assistant turn begins streaming.

## Visible affordances

- Warm-handoff is a single-frame insertion — no scroll jump, no animation flash.
- Existing conversation history is preserved; the popup turn appears at the end.

## Failure-mode expectations

- Handoff write failure -> nothing is queued; popup stays open with a "Ega couldn't open the side panel. Try again." toast.

## Cautions

- Warm-handoff must NOT clear the conversation. The popup turn appends; it doesn't reset.
- Each queued entry gets a unique `${ts}-${counter}` key, so two quick sends never overwrite each other.
