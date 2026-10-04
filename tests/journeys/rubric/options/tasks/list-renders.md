# Options-tasks list-renders rubric

## Latency budgets

- Tab click -> seven rows visible: <= 500ms.

## State expectations

- Step 1: the user opens the Tasks tab and sees seven built-in rows.
- Step 2: a task with stored edits shows "Edited"; a task in `disabledTasks` shows "Off" with its checkbox unchecked.

## Visible affordances

- Translate's checkbox is disabled, and its row has an "Always on" badge.
- Every row has an Edit button named "Edit <task>".

## Failure-mode expectations

- While settings load, the tab shows a loading state, not an empty list.

## Cautions

- An off task stays listed, so the user can turn it on again.
