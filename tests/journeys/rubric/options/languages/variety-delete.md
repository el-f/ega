# Options-languages variety-delete rubric

## Latency budgets

- Delete click -> confirm dialog: <= 100ms.
- Confirm -> row removal: <= 200ms.

## State expectations

- Step 1: user clicks the delete affordance on a custom variety row.
- Step 2: a confirm dialog surfaces naming the variety to be removed.
- Step 3 (confirm): the entry is removed from `customLanguages`; the row disappears from the list.

## Visible affordances

- Confirm dialog uses warning tone tokens.
- The dialog warns if the variety is currently in use as a default target language.

## Failure-mode expectations

- Cancel leaves the variety untouched.
- Deleting an in-use default surfaces a follow-up notice; the default falls back to the language family's standard.

## Cautions

- Delete is permanent (no Undo); the user can re-add the variety with the same fields.
- The dialog must trap focus while open.
