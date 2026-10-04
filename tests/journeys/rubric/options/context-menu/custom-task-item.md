# Options-context-menu custom-task-item rubric

## Latency budgets

- Select change -> `contextMenuItems` write: <= 300ms.

## State expectations

- Step 1: the Task select of a text item lists the custom task by name.
- Step 2 (pick it): the item's stored `task` is the custom task's id.

## Visible affordances

- Image items still offer only Translate and Explain.

## Failure-mode expectations

- A storage write failure shows a "Change not saved" warning.

## Cautions

- When the task is turned off or deleted, the right-click menu leaves the item out.
