# Tooltip task-switch rubric

## Latency budgets

- Task picker open: <= 100ms after pill click.
- Task change -> new request fired: <= 100ms after selection.

## State expectations

- Step 1: tooltip topbar carries a native Task select showing the active task (Translate / Explain / Summarize / Reword / Grammar / Reply ideas / Ask).
- Step 2 (pick a new task): the tooltip reopens at the same anchor with the new task's loading label (e.g. "Explaining…"), then its output.
- Step 3: on stream end, header finalizes with the new task's metadata.

## Visible affordances

- Task pill has a `combobox` role and a clear accessible name.
- All tasks are always enabled in the select; there is no per-backend disabled state.

## Failure-mode expectations

- Switching task mid-stream cancels the prior request; no orphan tokens land after the switch.

## Cautions

- Task switch must preserve the user's source text and tone selection.
- The audit log has no cancel-reason field; each request gets its own row with its task.
