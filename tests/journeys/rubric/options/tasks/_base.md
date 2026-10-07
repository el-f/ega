# Options-tasks surface rubric

## Mount + render

- The Tasks tab has four cards: "Defaults" ("What runs when you do not pick a task"; Default task and Default tone side by side), "Built-in tasks" with one row per built-in in shipped order and an (i), "Your tasks", and "Backup and restore" last. Rules live on the Glossary and rules tab.
- Each row is one line: the on/off checkbox named after the task, an "Edited" pill when the task has edits, and an Edit button. No "Off" word, no "Built-in" badge, no box per row.
- Translate's checkbox stays checked and focusable (aria-disabled); the "Always on" pill is its visible reason.

- "Your tasks" lists the user's own tasks with a secondary New task in the header. With none, the empty state "No tasks of your own yet" holds the only New task (primary), and the header button is hidden. At the cap, New task is aria-disabled and a line says "You have the most tasks Ega keeps (50). Delete one to add another."

## Edit dialog (built-in tasks)

- Edit opens a dialog titled "<Task> task" with one help line. Settings come first: Effort (Default, Off, Low, Medium, High) with "Default for this task is <level>", Inputs (Send page context, Use glossary), and the fixed facts line "Answers: Answer only · Text only". The prompt comes second, in the one prompt editor (Edit | Preview, Insert variable, the locked Answer format). Explain has no prompt of its own and offers "Edit the Translate prompt".
- Every field saves as it changes (text after a 600 ms pause). The footer holds the "Reset task" pill (only when the task differs), a status line ("Saved", "Not saved: ...", "Back to built-in" + Undo) and Done. There is no Save button.

## Task editor (your own tasks)

- New task and Edit open the same dialog: Name, Answers (Answer only / Answer with notes), Effort, Inputs (Send page context, Reads images, Use glossary, Show in right-click menu) and the same prompt editor.
- The task saves itself once it has a name and a message with the selected text; until then the footer says "Not saved yet: add a name". Delete task acts at once with an Undo toast.

## A11y

- Each checkbox and select has a name; the dialog has a heading with the task name.
