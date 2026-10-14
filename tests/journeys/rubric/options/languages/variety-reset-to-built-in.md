# Options-languages variety-reset-to-built-in rubric

## Latency budgets

- Reset language -> override gone from storage: <= 300ms.

## State expectations

- Step 1: a built-in with an edited hint; the user opens it with Edit.
- Step 2 (Reset language): the whole override is deleted; the fields show the shipped notes and examples; the footer says "Back to built-in" with Undo, and focus moves to Undo.
- Step 3 (Undo): the override comes back exactly as it was, and the fields show it.

## Visible affordances

- "Reset language" shows only on a built-in that has edits; a custom language has Delete and Export instead.

## Failure-mode expectations

- A failed reset keeps the override, and the footer says it was not saved.

## Cautions

- Reset removes the override; it never writes a copy of the shipped values.
