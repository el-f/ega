# Options-tasks export rubric

## Latency budgets

- Export click -> download starts: <= 500ms.

## State expectations

- Step 1: the user clicks Export tasks on the Tasks tab.
- Step 2: a file named `ega-tasks-<date>.json` downloads, holding `egaTasks` with `v: 2`, the custom task rows, the task edits, the off tasks and the Translate prompt (null when it is the shipped one).
- Step 3: the status line says how many tasks and edits it exported.

## Visible affordances

- Export and Import sit in a "Backup & restore" card at the top of the tab, like the Languages tab.

## Failure-mode expectations

- A failed export says "Export failed: …" in the status line.

## Cautions

- The default task and tone are not in this file; the full backup carries them.
