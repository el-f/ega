# Options right-click menu hidden-reason rubric

## Latency budgets

- Tasks toggle -> `disabledTasks` write: <= 300ms.

## State expectations

- Step 1: Explain is turned off on the Tasks tab; `disabledTasks` holds `explain`.
- Step 2: on the Selection & picker tab, the "Explain image in side panel" row reads "Hidden: Explain is off in Tasks" under its name.

## Visible affordances

- The row's checkbox stays checked and focusable (`aria-disabled`), and its description is the reason. A click on it changes nothing.
- The row's name is in the secondary text colour, like any hidden row.

## Failure-mode expectations

- The reason is visible text, never only a hover tooltip.

## Cautions

- Chrome leaves the item out of the real menu while the task is off; the card must not show it as shown.
