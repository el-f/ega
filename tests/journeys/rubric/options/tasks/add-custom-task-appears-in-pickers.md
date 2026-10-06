# Options-tasks add-custom-task-appears-in-pickers rubric

## Latency budgets

- The first valid edit -> row in `ega.customTasks`: <= 1s (600 ms typing pause plus the write).

## State expectations

- Step 1: the user opens New task; the footer reads "Not saved yet: add a name".
- Step 2: they type a name, instructions (inserting Target language from Insert variable) and a message with `{{text}}`, pick "Answer with notes", Low effort and the three inputs, and look at Preview.
- Step 3 (Done): `ega.customTasks` holds one row with every field the user set; the "Your tasks" list shows it.
- Step 4: a side panel opened next shows the task as a chip in the strip.
- Step 5: the tooltip's task select lists the task by name.

## Visible affordances

- No Save and no Cancel button: the task saves itself once it has a name and a valid message; Done closes.

## Failure-mode expectations

- At the row cap the "New task" button says why it cannot open; nothing is written.

## Cautions

- The chip and the tooltip read the rows from storage, so a page opened before the save picks the task up after a storage change.
