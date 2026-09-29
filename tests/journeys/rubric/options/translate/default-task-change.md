# Options-translate default-task-change rubric

## Latency budgets

- Task select change -> storage write + tone sub-section expand: <= 200ms.

## State expectations

- Step 1: user opens Translate tab; default task is "Translate".
- Step 2 (change to Reword): `defaultTask` writes to storage; the tone sub-section expands below the task selector.
- Step 3: user can pick a default tone within the now-visible tone sub-section; tone persists separately.

## Visible affordances

- Task selector uses a combobox or radiogroup with a label "Default task".
- Tone sub-section expands with a fade-in when the selected task supports tone variants (e.g. Reword, Explain).
- Tone sub-section collapses when a task is chosen that has no tone variants (e.g. Translate).

## Failure-mode expectations

- Switching back to Translate hides the tone sub-section; the persisted tone value is preserved (not deleted) for when Reword is re-selected.
- Storage write failure surfaces an inline error; selector reverts to last persisted task.

## Cautions

- Tone sub-section visibility is driven by the selected task, not by the presence of a persisted tone value.
- The expanded tone section must not cause layout shift that pushes other controls off screen.
