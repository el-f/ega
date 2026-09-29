# Templates-editor task-chip-save-persists rubric

## Latency budgets

- Save click -> `taskTemplates.reword` write: <= 200ms.
- Save ack visible: <= 300ms.

## State expectations

- Step 1: user selects the Reword task chip in the chip rail.
- Step 2: user edits the template body for the Reword scope.
- Step 3 (click Save): `taskTemplates.reword` persists to storage with the new body; a "Saved" ack appears and the dirty badge clears.

## Visible affordances

- Save button is disabled when the Reword body is unchanged from the inherited default.
- The active chip shows a dirty badge while the draft differs from storage.

## Failure-mode expectations

- Saving the Reword chip must NOT overwrite the Global template or any other task template.
- Storage write failure surfaces an inline error pill; the draft stays in the editor.

## Cautions

- `taskTemplates.reword` is a separate key from `promptTemplate` (Global) — saving one never touches the other.
- The compiled preview updates to reflect the Reword-scoped template body after Save.
