# Popup-sidepanel-handoff handoff-then-refine rubric

## Latency budgets

- Refine preset pick -> new version starts: <= 1.5s.

## State expectations

- Step 1: popup "Translate in the side panel" box + Translate queues `ega.pendingPopupHandoff`; sidepanel mounts and drains it — the seeded UserTurn + completed AssistantTurn are visible.
- Step 2: the user opens the seeded reply's Refine menu and picks a preset ("Shorter").
- Step 3: the reply gains version 2 in place (pager 2/2, not a new message); the seeded answer stays as version 1.

## Visible affordances

- The Refine button appears in the reply's action row once the seeded reply is done — NOT while it streams.
- Translate presets are "Shorter", "Less formal" and "Keep slang", then "Describe a change…" for free text.

## Failure-mode expectations

- Refine network failure -> the error shows on the new version; seeded original turn remains readable.
- If the handoff payload had `imageDataUrl` set, the Refine menu holds only the language items — it seeds a finished image-translate turn.

## Cautions

- The handoff seeded turn must carry `lastDispatch` context so the refine request references the correct source input.
- Refine must not append a second UserTurn — it amends only the assistant slot.
- Cache key for the refine request must differ from the initial translate key (modifier applied).
