# Options-tasks reset-builtin-undo rubric

## Latency budgets

- Reset click -> edit gone from storage: <= 300ms.

## State expectations

- Step 1: Reword has edits; its dialog footer shows the "Reset task" pill.
- Step 2 (Reset): `taskOverrides.reword` is removed at once, every field shows the built-in value, the pill hides and the footer reads "Back to built-in" with an Undo text button that takes focus.
- Step 3 (Undo): the removed edit comes back exactly; the footer reads "Your edits are back".

## Visible affordances

- No confirm before Reset; Undo is the safety net. Closing after a reset with no Undo repeats the Undo in a toast ("Reword is back to built-in").

## Failure-mode expectations

- A failed reset says so in the footer and keeps the edit.

## Cautions

- On Translate, Reset also resets the Translate prompt; Undo puts both back.
