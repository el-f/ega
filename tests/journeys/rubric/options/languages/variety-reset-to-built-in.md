# Options-languages variety-reset-to-built-in rubric

## Latency budgets

- Reset click -> override gone from storage: <= 300ms.
- Reset click -> success toast visible: <= 300ms.

## State expectations

- Step 1: the Languages tab lists the built-in with an edited hint; its editor opens from the row's Edit button.
- Step 2 (Reset to built-in): the whole override for that language is deleted; the editor shows the shipped hint and examples again.
- Step 3 (Undo on the toast): the saved override comes back exactly as it was.

## Visible affordances

- "Reset to built-in" shows only on a built-in that has edits; a custom language has no such button.
- The success toast names the language ("… reset to built-in.") and carries an Undo action.

## Failure-mode expectations

- A failed reset shows a danger toast that names the language and the error; the override stays.

## Cautions

- Reset removes the override; it never writes a copy of the shipped values.
