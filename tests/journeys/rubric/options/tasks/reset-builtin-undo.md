# Options-tasks reset-builtin-undo rubric

## Latency budgets

- Reset click -> edit gone from storage: <= 300ms.
- Reset click -> toast with Undo visible: <= 300ms.

## State expectations

- Step 1: Reword has edits; its dialog's "Reset to built-in" is enabled.
- Step 2 (Reset): `taskOverrides.reword` is removed, the dialog closes, and the row loses its "Edited" badge.
- Step 3 (Undo on the toast): the removed edit comes back exactly as it was.

## Visible affordances

- The toast names the task ("Reword is back to the built-in settings.") and has an Undo action.

## Failure-mode expectations

- A failed reset shows a "Change not saved" warning toast and keeps the edit.

## Cautions

- On Translate, Reset also resets the Translate prompt, after a confirm that says Explain and every language without its own prompt use it; Undo puts both back.
