# Templates-editor per-field-reset-sys rubric

## Latency budgets

- Reset-system click -> system field restore: <= 150ms.

## State expectations

- Step 1: user has overridden both system and user fields; both differ from inherited defaults.
- Step 2 (click the system per-field reset): the system textarea restores to the inherited default body.
- Step 3: the user textarea is unchanged; the dirty state reflects only the user field divergence.

## Visible affordances

- Each field (system / user) carries its own reset icon button; the button is disabled when that field matches the inherited default.
- A subtle "Restored" ack appears briefly on the system field after reset.

## Failure-mode expectations

- Per-field reset does NOT commit to storage — it restores the in-editor draft; explicit Save is still required.

## Cautions

- System field reset must NOT touch the user field value under any condition.
- The reset button must be hidden when the current scope has no per-field inherited default to restore.
