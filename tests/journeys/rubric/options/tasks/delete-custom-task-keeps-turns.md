# Options-tasks delete-custom-task-keeps-turns rubric

## Latency budgets

- Delete click -> row gone from `ega.customTasks`: <= 300ms.

## State expectations

- Step 1: the conversation has one exchange run with the custom task.
- Step 2 (Delete task in its dialog): the row goes at once, the dialog closes and a toast says "Deleted "<name>"" with Undo.
- Step 3: the side panel's Next message popover no longer lists the task; the old answer stays, and its user turn reads "Deleted task".

## Visible affordances

- No confirm dialog; Undo puts back the task, its right-click items and its marks exactly.

## Failure-mode expectations

- A failed delete says so in the dialog footer and keeps the row.

## Cautions

- "Answer again as" in the old reply's More menu does not offer the gone task.
