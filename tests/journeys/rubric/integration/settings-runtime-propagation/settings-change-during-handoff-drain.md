# Settings-runtime-propagation settings-change-during-handoff-drain rubric

## Latency budgets

- Patched backend setting -> reflected in the sidepanel's first dispatch: <= 200ms after settings write.

## State expectations

- Step 1: popup writes `pendingPopupHandoff` (slot written, sidepanel NOT yet open).
- Step 2: settings write patches `backendOrder` or active backend between slot write and sidepanel mount.
- Step 3: sidepanel mounts cold, drains the slot, and dispatches the seeded turn — the outbound request uses the PATCHED backend, not the one in effect at handoff-write time.

## Visible affordances

- The active-backend chip in the side panel header shows the patched backend.

## Failure-mode expectations

- If settings race means the patch lands AFTER the drain fires, the first turn uses the pre-patch backend — this is an acceptable race; the test must document which timing is observable.

## Cautions

- The handoff slot stores text, language pair, task and tone (plus optional image/response) — it does NOT snapshot backend settings. Settings are always resolved live at dispatch time.
- This distinguishes the handoff slot from a full session snapshot: a stale backend in the slot would be a bug.
