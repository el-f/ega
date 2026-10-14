# Options-tasks list-renders rubric

## Latency budgets

- Tab click -> seven rows visible: <= 500ms.

## State expectations

- Step 1: the user opens the Tasks tab and sees seven built-in rows.
- Step 2: a task with stored edits shows "Edited"; a task in `disabledTasks` has its checkbox unchecked (no extra "Off" word).

## Visible affordances

- Translate's checkbox stays checked and focusable (aria-disabled); the "Always on" pill is its visible reason, read through aria-describedby.
- Rows are one line each with hairlines between them, not boxes.
- Every row has an Edit button named "Edit <task>".

## Failure-mode expectations

- While settings load, the tab shows a loading state, not an empty list.

## Cautions

- An off task stays listed, so the user can turn it on again.
