# Templates-editor per-task-params-temperature-override rubric

## Latency budgets

- Input change -> storage write: <= 300ms (debounced).
- Clear action -> key removed from storage: <= 200ms.

## State expectations

- Step 1: user is on a task chip (e.g., Translate) and edits the temperature override input field.
- Step 2 (commit value): `taskTemperatures.translate` persists to storage with the entered value.
- Step 3 (clear / delete the input): `taskTemperatures.translate` key is removed from storage; the field reverts to showing the inherited global temperature as a placeholder.

## Visible affordances

- Temperature input shows the inherited global value as placeholder when no override exists.
- A clear / delete affordance appears when an override is set; clicking it removes the key.

## Failure-mode expectations

- Invalid temperature value (outside 0.0–2.0 range) surfaces inline validation; storage is not written until a valid value is entered.
- Clearing the field to empty removes the `taskTemperatures` key, not writes `null` or `0`.

## Cautions

- Per-task temperature overrides apply only to the next request for that task; the global temperature is unchanged.
- The compiled preview does NOT reflect temperature in its rendered text — no verification via preview.
