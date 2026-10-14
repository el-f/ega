# Options-tasks insert-at-cursor-into-sys rubric

## Latency budgets

- Pick a variable -> token in the field: <= 200ms.

## State expectations

- Step 1: the user puts the caret in Instructions, then opens Insert variable.
- Step 2 (pick a row): the `{{token}}` goes in at that caret; the list closes.
- Step 3: focus is back in Instructions with the caret right after the token; Message is unchanged.

## Visible affordances

- One Insert variable button; no chip row.

## Failure-mode expectations

- With no field focused yet, the token goes into Message (it holds the selected text).
- Selected text always goes into Message, wherever the caret was.

## Cautions

- The insert never overwrites text around the caret.
