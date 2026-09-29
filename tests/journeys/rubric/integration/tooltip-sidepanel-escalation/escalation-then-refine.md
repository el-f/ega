# Tooltip-sidepanel-escalation escalation-then-refine rubric

## Latency budgets

- Pin-to-sidepanel click -> seeded turn visible: <= 800ms.
- Refine chip click -> variant stream starts: <= 1.5s.

## State expectations

- Step 1: tooltip Explain completes; user clicks Pin (or Continue-in-sidepanel after explain).
- Step 2: sidepanel mounts with the explain result seeded as a UserTurn + AssistantTurn pair.
- Step 3: refine chips render below the seeded AssistantTurn; user clicks [Shorter] (or another chip); a variant AssistantTurn spawns in place without appending a new UserTurn.

## Visible affordances

- Seeded turn carries a "from tooltip Explain" origin marker.
- Refine chips use the same labels as standard sidepanel refine (no escalation-specific chips).

## Failure-mode expectations

- Refine failure after escalation -> inline error on variant slot; seeded original explain result remains readable.

## Cautions

- The refine request must carry the explain turn's source text as input, not the tooltip's raw selection.
- Escalation path must preserve `lastDispatch` with the explain payload so refine references the correct input.
- Tooltip must NOT re-fire the explain on escalation; the result is captured verbatim.
