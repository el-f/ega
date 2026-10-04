# Rules-editor delete-rule rubric

## Latency budgets

- Delete click -> rule removed: <= 200ms.

## State expectations

- Step 1: the rule row shows a delete icon.
- Step 2 (click): the rule is removed from `rules` at once, with no confirm dialog; a "Rule deleted." toast with an Undo action shows.

## Visible affordances

- Delete icon rests muted like its siblings and turns to the danger tone on hover/focus.
- Undo toast carries a clear "Undo" button.

## Failure-mode expectations

- Undo restores the rule in its original position in the list, not at the bottom.

## Cautions

- Delete is permanent after the Undo window expires; no recycle bin.
- The Undo buffer is per-session in-memory — it does not survive closing the options page.
