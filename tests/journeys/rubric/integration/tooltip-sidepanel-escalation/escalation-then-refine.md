# Tooltip-sidepanel-escalation escalation-then-refine rubric

## Latency budgets

- Pin-to-sidepanel click -> seeded turn visible: <= 800ms.
- Refine preset pick -> new version starts: <= 1.5s.

## State expectations

- Step 1: tooltip translate (with its explanation) completes; user clicks Pin to side panel.
- Step 2: sidepanel re-sends the source text as a new UserTurn; a fresh AssistantTurn streams the translation and keeps the tooltip's explanation.
- Step 3: the user opens the seeded reply's Refine menu and picks "Shorter"; the reply gains version 2 in place, without a new message.

## Visible affordances

- The Refine menu is the same as on any side panel reply (no escalation-specific items).

## Failure-mode expectations

- Refine failure after escalation -> the error shows on the new version; seeded original explain result remains readable.

## Cautions

- The refine request must carry the explain turn's source text as input, not the tooltip's raw selection.
- Escalation path must preserve `lastDispatch` with the explain payload so refine references the correct input.
- The tooltip does not re-fire; the side panel re-sends the translate, and only the tooltip's explanation is carried over verbatim.
