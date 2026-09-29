# Templates-editor task-chip-reset-clears-task-template rubric

## Latency budgets

- Reset click -> storage write + editor reload: <= 200ms.

## State expectations

- Step 1: user is on the Reword chip with a saved `taskTemplates.reword` override.
- Step 2 (click Reset): a confirm dialog surfaces noting the task template will be cleared.
- Step 3 (confirm): `taskTemplates.reword` is set to `null` (or removed) in storage; editor reloads with the inherited Global body.

## Visible affordances

- Reset button label reads "Reset to task default" or "Reset to global" to convey the fallback destination.
- Confirm dialog uses warning tone tokens.

## Failure-mode expectations

- Cancel leaves `taskTemplates.reword` unchanged and keeps the editor showing the override body.
- After reset, the editor shows the inherited Global body, not a blank field.

## Cautions

- Setting `taskTemplates.reword` to `null` is the correct write — the router then falls through to the Global template.
- Reset on the Reword chip must NOT clear `taskTemplates` entries for other task chips.
