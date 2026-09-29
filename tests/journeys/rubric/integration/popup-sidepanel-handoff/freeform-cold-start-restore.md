# Popup-sidepanel-handoff freeform-cold-start-restore rubric

## Latency budgets

- Send-to-panel click -> sidepanel cold-start open + first turn: <= 800ms.

## State expectations

- Step 1: sidepanel is NOT open. User types in popup freeform; clicks Send-to-panel.
- Step 2: handoff payload writes to `pendingPopupHandoff`; popup dismisses; sidepanel mounts cold.
- Step 3: sidepanel reads the slot on mount; UserTurn appears seeded with the text; assistant turn begins streaming.

## Visible affordances

- The cold-start mount has NO flash of an empty conversation — the seeded turn renders in the first frame.

## Failure-mode expectations

- Sidepanel API failure (rare) -> popup re-mounts with an inline error; the composer text is preserved.

## Cautions

- The cold-start handoff path is the canonical user flow — most users have the panel closed.
- The seeded turn must be indistinguishable from a normally-sent turn (no special styling that confuses).
