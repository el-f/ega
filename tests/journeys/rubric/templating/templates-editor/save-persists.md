# Templates-editor save-persists rubric

## Latency budgets

- Save click -> storage write: <= 200ms.
- Save ack visible: <= 300ms.

## State expectations

- Step 1: user edits the template body for the active scope.
- Step 2 (click Save): `templates[scope]` (or `perPresetTemplates[preset]`) writes to storage.
- Step 3: a subtle "Saved" ack appears in the row; the "modified" indicator clears.

## Visible affordances

- Save button is disabled when the body is unchanged; enabled on first keystroke.
- The compiled preview updates within 100ms of Save.

## Failure-mode expectations

- Storage write failure (quota / serialization) surfaces an inline error pill; the draft remains in the textarea.

## Cautions

- Save must NOT happen on blur — explicit click only (mirrors the family-base contract).
- Save must NOT strip trailing whitespace in template bodies — whitespace can be significant.
