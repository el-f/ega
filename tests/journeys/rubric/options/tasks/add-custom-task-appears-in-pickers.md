# Options-tasks add-custom-task-appears-in-pickers rubric

## Latency budgets

- Save click -> row in `ega.customTasks`: <= 300ms.

## State expectations

- Step 1: the user opens New task, types a name, instructions and a message with `{{text}}`, picks "Answer with notes", an effort and the three inputs, and opens "Preview what the model receives".
- Step 2: the preview shows the instructions and the message as the router builds them.
- Step 3 (Save): `ega.customTasks` holds one row with every field the user set; the "Your tasks" list shows it.
- Step 4: a side panel opened next shows the task as a chip in the strip.
- Step 5: the tooltip's task select lists the task by name.

## Visible affordances

- Save is disabled while the name is empty or the message has no `{{text}}`.
- The list row has an on/off checkbox, a Custom badge and an Edit button.

## Failure-mode expectations

- At the row cap the dialog says to delete a task first; nothing is written.

## Cautions

- The chip and the tooltip read the rows from storage, so a page opened before the save picks the task up after a storage change.
