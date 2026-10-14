# Rules-editor delete-rule rubric

## Latency budgets

- Delete click -> rule removed: <= 200ms.

## State expectations

- Step 1: the user opens the row with Edit; "Delete rule" sits at the end of its fields.
- Step 2 (click): the rule is removed from `rules` at once, with no confirm dialog; a toast Deleted "<rule>" with an Undo action shows.
- Focus moves to the next rule's checkbox, else the previous one, else the Add rule button.

## Visible affordances

- "Delete rule" is a ghost button with a trash icon and a word, not an icon alone.
- The Undo toast carries a clear "Undo" button.

## Failure-mode expectations

- Undo restores the rule in its original position in the list, not at the bottom.
- A failed write offers no Undo.

## Cautions

- Delete is permanent after the Undo window expires; no recycle bin.
- The Undo buffer is per-session in-memory — it does not survive closing the options page.
