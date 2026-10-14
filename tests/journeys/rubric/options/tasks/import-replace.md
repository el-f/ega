# Options-tasks import-replace rubric

## Latency budgets

- Replace click -> storage written and status shown: <= 1s.

## State expectations

- Step 1: the user picks a tasks file; a confirm asks "Replace your tasks and task edits?" with the file's counts.
- Step 2 (Replace): `ega.customTasks` holds the file's good rows only; `taskOverrides` and `disabledTasks` are the file's.
- Step 3: the status line reads "Imported N tasks and N edits. Skipped N." and the "Your tasks" list shows the new rows.

## Visible affordances

- Cancel on the confirm writes nothing.

## Failure-mode expectations

- A file that is not JSON, has no `egaTasks`, or has a bad `v` fails with a message and writes nothing; a newer file says to update Ega.

## Cautions

- Import replaces; it does not merge with the current tasks.
