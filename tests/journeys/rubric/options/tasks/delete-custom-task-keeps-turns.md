# Options-tasks delete-custom-task-keeps-turns rubric

## Latency budgets

- Confirm click -> row gone from `ega.customTasks`: <= 300ms.

## State expectations

- Step 1: the conversation has one exchange run with the custom task.
- Step 2 (Delete, confirm): `ega.customTasks` is empty.
- Step 3: the side panel drops the chip; the old answer stays, and its user turn reads "Deleted task".

## Visible affordances

- The confirm dialog says right-click items that run the task are removed, rules scoped only to it stop applying, and past answers stay.

## Failure-mode expectations

- A failed delete shows a "Change not saved" warning and keeps the row.

## Cautions

- "Try as…" on the old turn shows the gone task as a disabled item.
