# Snippets delete-snippet rubric

## Latency budgets

- Delete click -> confirm dialog: <= 100ms.
- Confirm -> row removal: <= 200ms.

## State expectations

- Step 1: user clicks the delete affordance on a snippet row.
- Step 2: a confirm dialog surfaces; the dialog body names the snippet to be removed.
- Step 3 (confirm): the snippet entry is removed from storage; the row disappears from the list.

## Visible affordances

- Confirm dialog uses warning tone tokens.
- The dialog warns if the snippet is currently bound to any task template.

## Failure-mode expectations

- Cancel leaves the snippet untouched.
- A bound snippet that is deleted leaves the binding unresolved in the template — Compiled preview flags it as missing.

## Cautions

- Delete is permanent (no Undo for snippets — they're cheap to recreate).
- The dialog must trap focus while open.
