# Options-tasks toggle-hides-everywhere rubric

## Latency budgets

- Checkbox -> `disabledTasks` write: <= 200ms.

## State expectations

- Step 1 (uncheck Reword): `disabledTasks` becomes ["reword"] and its checkbox is unchecked.
- Step 2: a side panel opened after that has no Reword in the mode chip's Next message popover.
- Step 3: after one translation, the reply's More menu lists no Reword under "Answer again as". Arrowing through that menu starts no new answer, and Escape puts focus back on More.
- Step 4: the command palette lists no "Switch task: Reword".
- Step 5: the tooltip's task select lists every built-in except Reword.

## Visible affordances

- The other tasks stay where they were; only the off task is gone.

## Failure-mode expectations

- A storage write failure shows a "Change not saved" warning toast.

## Cautions

- A turn or menu item that already uses an off task keeps it as a disabled option, so its select never shows a blank value.
