# Popup-sidepanel-handoff handoff-then-refine rubric

## Latency budgets

- Refine chip click -> variant stream starts: <= 1.5s.

## State expectations

- Step 1: popup freeform Send-to-panel writes `pendingPopupHandoff`; sidepanel mounts and drains the slot — the seeded UserTurn + completed AssistantTurn are visible.
- Step 2: user clicks a quick-refine chip below the seeded assistant turn.
- Step 3: a variant AssistantTurn spawns in place (not a new UserTurn); the original seeded content is preserved alongside the variant.

## Visible affordances

- Refine chips appear after the seeded assistant turn reaches the done state — NOT while streaming.
- Chip labels match the standard refinement set (e.g., "More casual", "Simpler").

## Failure-mode expectations

- Refine network failure -> inline error on the variant slot; seeded original turn remains readable.
- If the handoff payload had `imageUrl` set, refine chips are absent — image turns are non-refinable.

## Cautions

- The handoff seeded turn must carry `lastDispatch` context so the refine request references the correct source input.
- Refine must not append a second UserTurn — it amends only the assistant slot.
- Cache key for the refine request must differ from the initial translate key (modifier applied).
