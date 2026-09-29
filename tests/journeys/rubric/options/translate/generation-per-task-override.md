# Options-translate generation-per-task-override rubric

## Latency budgets

- Input change + blur -> storage write: <= 300ms.

## State expectations

- Step 1: user opens the per-task override section for the Translate task (inside generation tuning).
- Step 2: user enters a temperature value in the Translate input field; field blurs.
- Step 3: `taskTemperatures.translate` is written to storage; subsequent translate dispatches use this override.
- Step 4 (click ResetField on the per-task row): `taskTemperatures.translate` is deleted from storage; the row shows the inherited global value.

## Visible affordances

- Per-task row shows the task name + an input field + a ResetField icon (visible when the key exists in storage).
- Input accepts decimal values in the same range as the global slider.
- When the key is absent (no override), the input shows the inherited global value in a muted style.

## Failure-mode expectations

- Non-numeric or out-of-range input surfaces an inline validation error; no write.
- Storage write failure surfaces an inline error toast; input reverts to last persisted value.

## Cautions

- ResetField deletes the key entirely (not setting it to the default float) so `resolveTaskTemperature` falls back to global correctly.
- Per-task temperature takes precedence over global at every dispatch; the override is not merged, it fully replaces.
