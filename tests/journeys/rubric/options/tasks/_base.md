# Options-tasks surface rubric

## Mount + render

- The Tasks tab has a "Defaults" card (Default task, Default tone), a "Built-in tasks" card with one row per built-in in shipped order, "Your tasks", "Rules", and "Backup & restore" last.
- Each row has an on/off checkbox, the task name, an Edited badge when the task has edits, an Off badge when it is off, and an Edit button. No row carries a "Built-in" badge.
- Translate's checkbox is disabled and the row has an "Always on" badge.

- A "Your tasks" card lists the user's own tasks, with a New task button; with none, an empty state "No tasks of your own yet" has its own New task button. Each row has an on/off checkbox and an Edit button.

## Edit dialog (built-in tasks)

- Edit opens a dialog titled "<Task> task" with one help line. Settings come first: Effort (Default, Off, Low, Medium, High) with "Default for this task is <level>", Inputs (Send page context, Use glossary), and the fixed facts line "Answers: Answer only · Text only". The prompt comes second, in the one prompt editor (Edit | Preview, Insert variable, the locked Answer format). Explain has no prompt of its own and offers "Edit the Translate prompt".
- Every field saves as it changes (text after a 600 ms pause). The footer holds the "Reset task" pill (only when the task differs), a status line ("Saved", "Not saved: ...", "Back to built-in" + Undo) and Done. There is no Save button.

## Task editor (your own tasks)

- New task and Edit open the same dialog: Name, Answers (Answer only / Answer with notes), Effort, Inputs (Send page context, Reads images, Use glossary, Show in right-click menu) and the same prompt editor.
- The task saves itself once it has a name and a message with the selected text; until then the footer says "Not saved yet: add a name". Delete task acts at once with an Undo toast.

## A11y

- Each checkbox and select has a name; the dialog has a heading with the task name.
