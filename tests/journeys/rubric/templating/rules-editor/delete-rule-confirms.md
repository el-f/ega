# Rules-editor delete-rule-confirms rubric

## Latency budgets

- Delete click -> confirm dialog: <= 100ms.
- Confirm -> rule removed: <= 200ms.

## State expectations

- Step 1: rule row shows a delete icon.
- Step 2 (click): a confirm dialog surfaces naming the rule body to be removed.
- Step 3 (confirm): the rule is removed from `rules`; an Undo toast surfaces with a 5s window.

## Visible affordances

- Delete icon uses the danger tone tokens; confirm dialog uses warning tokens.
- Undo toast carries a clear "Undo" button.

## Failure-mode expectations

- Canceling the confirm leaves storage untouched.
- Undo restores the rule in its original position in the list, not at the bottom.

## Cautions

- Delete is permanent after the Undo window expires; no recycle bin.
- The Undo buffer is per-session in-memory — it does not survive sidepanel close.
