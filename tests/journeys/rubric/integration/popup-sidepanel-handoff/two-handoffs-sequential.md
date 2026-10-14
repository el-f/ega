# Popup-sidepanel-handoff two-handoffs-sequential rubric

## Latency budgets

- Both seeded turns fully rendered: <= 1200ms from sidepanel mount.

## State expectations

- Step 1: two popup handoffs are written to `ega.pendingPopupHandoff` BEFORE the sidepanel opens; each write adds its own queued entry.
- Step 2: sidepanel mounts cold and drains the slot.
- Step 3: both seeded UserTurn + AssistantTurn pairs render in insertion order (first handoff above second); the slot is cleared after the drain.

## Visible affordances

- Turn 1 and turn 2 are visually distinct rows in the conversation, not merged into one.
- Both assistant turns complete before the composer becomes active.

## Failure-mode expectations

- The slot is a queue, so both handoffs survive; losing turn 1 is a bug.
- A stale first handoff (>60s) is discarded; only the fresh second one renders.

## Cautions

- The slot is one storage key holding a map of queued entries; a second popup write queues, never replaces.
- The drain must clear the slot regardless of how many turns were seeded.
