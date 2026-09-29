# Templates-editor per-task-params-tone-override-reword rubric

## Latency budgets

- Select change -> storage write: <= 200ms.
- Reset to inherit -> key removed from storage: <= 200ms.

## State expectations

- Step 1: user is on the Reword task chip and changes the tone select from "Inherit" to a specific tone (e.g., "Formal").
- Step 2 (select commits): `taskTones.reword` persists to storage with the selected tone value.
- Step 3 (select "Inherit" / reset): the `taskTones.reword` key is removed from storage; the select returns to the inherit placeholder.

## Visible affordances

- Tone select shows "Inherit (global)" or similar as the default option.
- A non-inherit selection makes a "Reset" affordance appear next to the select.

## Failure-mode expectations

- Selecting an invalid tone value (defensive) is blocked at the select level — only valid enum values are options.
- Storage write failure surfaces an inline error; the previous stored value is preserved.

## Cautions

- Per-task tone override applies only to the Reword task; other task tones are unaffected.
- "Inherit" removes the `taskTones.reword` key, not writes a special sentinel value.
