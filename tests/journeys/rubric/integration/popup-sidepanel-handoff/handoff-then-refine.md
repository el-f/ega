# Popup-sidepanel-handoff handoff-then-refine rubric

## Latency budgets

- Refine chip click -> variant stream starts: <= 1.5s.

## State expectations

- Step 1: popup freeform Open in side panel queues `ega.pendingPopupHandoff`; sidepanel mounts and drains it — the seeded UserTurn + completed AssistantTurn are visible.
- Step 2: user clicks a quick-refine chip below the seeded assistant turn.
- Step 3: a variant AssistantTurn spawns in place (not a new UserTurn); the original seeded content is preserved alongside the variant.

## Visible affordances

- Refine chips appear after the seeded assistant turn reaches the done state — NOT while streaming.
- Chip labels are "Shorter", "Less formal", "Keep slang", plus a "Write your own…" chip for free text.

## Failure-mode expectations

- Refine network failure -> inline error on the variant slot; seeded original turn remains readable.
- If the handoff payload had `imageDataUrl` set, refine chips are absent — it seeds a finished image-translate turn.

## Cautions

- The handoff seeded turn must carry `lastDispatch` context so the refine request references the correct source input.
- Refine must not append a second UserTurn — it amends only the assistant slot.
- Cache key for the refine request must differ from the initial translate key (modifier applied).
