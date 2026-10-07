# Rules-editor toggle-task-scope rubric

## Latency budgets

- Toggle click -> storage write: <= 150ms.

## State expectations

- Step 1: a rule is seeded with `scope.tasks = ['translate']`; its meta line says "Translate".
- Step 2 (Edit): "Applies to" shows "All tasks" not pressed and "Translate" pressed with a check icon.
- Step 3 (turn Translate off): `scope.tasks` becomes `[]`, "All tasks" turns pressed, and the meta line says "All tasks". No toast.

## Visible affordances

- "Applies to" is a group of toggle buttons (aria-pressed): "All tasks" plus one per task. A pressed toggle shows a check icon and the accent edge.
- Turning a task on turns "All tasks" off.

## Failure-mode expectations

- A failed write keeps the old scope and shows a "Not saved" toast.

## Cautions

- `scope.tasks = []` means the rule applies to ALL tasks — not that it is off.
- A task deleted since the rule was made shows as a pressed "Deleted task" toggle until turned off.
