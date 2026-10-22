# Smart-bubble bubble-menu-run-task rubric

## Latency budgets

- Run task -> task list visible: <= 100ms (the list is read when the menu opens).
- A task picked -> bubble gone and the tooltip loading: <= 300ms.

## State expectations

- Step 1: the chevron opens the menu; its first item is "Run task", with a chevron that points to where the list opens.
- Step 2: Run task opens a list of every task that is on, built-in and custom, beside the menu. It opens on the left when the right has no room, and moves up so its last item stays on screen.
- Step 3: picking a task hides the bubble and runs that task on the selection in the tooltip, as the right-click menu does.

## Visible affordances

- Run task is a menuitem with `aria-haspopup="menu"` and `aria-expanded`. Hover, click, Enter, Space or Right opens the list; Enter, Space and Right put focus on its first task. Left or Esc closes only the list and puts focus back on Run task.

## Failure-mode expectations

- With every task off, Run task is left out and the other two items still work. A custom task list that cannot be read leaves only the built-in tasks in the list.
