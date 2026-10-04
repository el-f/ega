# Options-tasks default-task-change rubric

## Latency budgets

- Select change -> storage write: <= 200ms.

## State expectations

- Step 1: the Tasks tab shows Default task "Translate" and Default tone "Neutral".
- Step 2 (pick Reword): `defaultTask` is "reword" in storage.
- Step 3 (pick Formal): `defaultTone` is "formal" in storage.

## Visible affordances

- Default tone is always visible, with help text that says it is used by tasks that write in a tone, like Reword.
- The Default task list holds only tasks that are on; an off default task shows as Translate.

## Failure-mode expectations

- A storage write failure shows a "Change not saved" warning toast.

## Cautions

- Turning the default task off keeps it stored as the default; Translate runs until it is on again.
