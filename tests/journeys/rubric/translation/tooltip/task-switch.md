# Tooltip task-switch rubric

## Latency budgets

- Task picker open: <= 100ms after pill click.
- Task change -> new request fired: <= 100ms after selection.

## State expectations

- Step 1: tooltip topbar carries a task picker pill with the active task name (translate / explain / etc).
- Step 2 (pick a new task): picker dismisses; pill updates; the previous result is replaced in place by the new task output.
- Step 3: on stream end, header finalizes with the new task's metadata.

## Visible affordances

- Task pill has a `combobox` role and a clear accessible name.
- Disabled tasks for the active backend are grayed out with a tooltip explaining why.

## Failure-mode expectations

- Switching task mid-stream cancels the prior request; no orphan tokens land after the switch.

## Cautions

- Task switch must preserve the user's source text and tone selection.
- The audit log records both the cancellation reason ("user-task-switch") and the new task launch.
