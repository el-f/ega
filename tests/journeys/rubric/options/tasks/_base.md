# Options-tasks surface rubric

## Mount + render

- The Tasks tab has a "Defaults" card (Default task, Default tone) and a "Built-in tasks" card with one row per built-in, in shipped order.
- Each row has an on/off checkbox, the task name, a Built-in badge, an Edited badge when the task has edits, an Off badge when it is off, and an Edit button.
- Translate's checkbox is disabled and the row says "always on".

- A "Your tasks" card lists the user's own tasks, with a New task button and the empty state "No tasks of your own yet."; each row has an on/off checkbox, a Custom badge and an Edit button.

## Edit dialog (built-in tasks)

- Edit opens a dialog for that task: its prompt editor (Translate edits the Translate prompt; Explain only names the prompt it uses), the fixed answer shape, Effort, the Send page context and Use glossary checkboxes, whether it takes images, and Reset to built-in.
- Every control writes on change; there is no Save button.

## Task editor (your own tasks)

- New task and Edit open an editor: Name, Instructions, Message (must contain {{text}}), the same Variables chips and Insert variable picker as the built-in editor (insert at the caret of the field focused last), Answer (Answer only / Answer with notes), Effort, the three Inputs checkboxes and the "Preview what the model receives" section.
- Save writes the row and closes the editor; Cancel closes it with no write; Delete asks first, then removes the task.

## A11y

- Each checkbox and select has a name; the dialog has a heading with the task name.
