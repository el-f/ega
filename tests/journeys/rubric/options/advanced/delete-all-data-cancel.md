# Options-advanced delete-all-data-cancel rubric

## Latency budgets

- Keep my data click -> dialog dismiss: <= 100ms.

## State expectations

- Step 1: the "Delete all data?" dialog is open; the user has typed a wrong or partial word (or nothing).
- Step 2: pressing the red button or Enter does nothing; then "Keep my data" closes the dialog without writing to storage.
- Step 3: all extension data remains untouched; the Data sub-tab is back in view.

## Visible affordances

- The red button is aria-disabled with the field label as its description; "Keep my data" is the secondary button and always works.

## Failure-mode expectations

- Keep my data always succeeds; it is a safe no-op.

## Cautions

- Even with the right word typed, Keep my data discards the operation — the red button is required to commit.
- The dialog must trap focus while open; Esc also closes it and returns focus to the Delete all data button.
