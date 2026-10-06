# Options-context-menu custom-task-item rubric

## Latency budgets

- Select change -> `contextMenuItems` write: <= 300ms.

## State expectations

- Step 1: Edit on a text item opens its options; the Task select lists the custom task by name.
- Step 2 (pick it): the item's stored `task` is the custom task's id, and the row's automatic name becomes the task's name.

## Visible affordances

- Image items still offer only Translate and Explain, as two radio choices.

## Failure-mode expectations

- A storage write failure shows a "Change not saved" warning.

## Cautions

- When the task is turned off or deleted, the right-click menu leaves the item out and the row says why.
