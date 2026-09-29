# Popup-sidepanel-handoff two-handoffs-sequential rubric

## Latency budgets

- Both seeded turns fully rendered: <= 1200ms from sidepanel mount.

## State expectations

- Step 1: two popup handoffs are written to `pendingPopupHandoff` sequentially BEFORE the sidepanel opens (second write overwrites or extends the slot depending on implementation).
- Step 2: sidepanel mounts cold and drains the slot.
- Step 3: both seeded UserTurn + AssistantTurn pairs render in insertion order (first handoff above second); the slot is cleared after the drain.

## Visible affordances

- Turn 1 and turn 2 are visually distinct rows in the conversation, not merged into one.
- Both assistant turns complete before the composer becomes active.

## Failure-mode expectations

- If the slot holds only the most-recent handoff (last-wins), turn 1 is silently lost — this is an acceptable degraded path; the rubric does not require both to survive if that is the design. Document the actual behavior.
- A stale first handoff (>60s) is discarded; only the fresh second one renders.

## Cautions

- The slot is keyed under a single storage key — a second popup write before the sidepanel opens either queues or replaces; the rubric verifies whichever behavior ships, not a specific one.
- The drain must clear the slot regardless of how many turns were seeded.
