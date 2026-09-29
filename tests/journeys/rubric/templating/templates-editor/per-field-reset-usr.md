# Templates-editor per-field-reset-usr rubric

## Latency budgets

- Reset-user click -> user field restore: <= 150ms.

## State expectations

- Step 1: user has overridden both system and user fields; both differ from inherited defaults.
- Step 2 (click the user per-field reset): the user textarea restores to the inherited default body.
- Step 3: the system textarea is unchanged; dirty state reflects only the system field divergence.

## Visible affordances

- Each field (system / user) carries its own reset icon button; the button is disabled when that field matches the inherited default.
- A subtle "Restored" ack appears briefly on the user field after reset.

## Failure-mode expectations

- Per-field reset does NOT commit to storage — it restores the in-editor draft; explicit Save is still required.

## Cautions

- User field reset must NOT touch the system field value under any condition.
- `{{text}}` is typically present in the user field default; restoring it removes any custom structure the user had added.
