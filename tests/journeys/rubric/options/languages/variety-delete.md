# Options-languages variety-delete rubric

## Latency budgets

- Delete language -> row removed: <= 200ms.

## State expectations

- Step 1: the user opens a custom language with Edit.
- Step 2 (Delete language): the dialog closes, the row and the stored entry go at once, and a toast Deleted "<name>" offers Undo.
- Step 3 (Undo): the language comes back in its old place, with its own prompt, picker visibility and any default or glossary entry that named it.

## Visible affordances

- "Delete language" is a ghost button with a trash icon in the dialog footer; built-in languages have no delete.

## Failure-mode expectations

- No confirm dialog: Undo is the safety net.

## Cautions

- After the toast is gone the delete is final.
