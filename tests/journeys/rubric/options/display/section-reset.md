# Options-display section-reset rubric

## Latency budgets

- Reset click -> storage write: <= 200ms.

## State expectations

- Step 1: the user changes an option (e.g. turns off Close when I click outside); the word "Changed" shows after its label and the "Reset section" pill appears.
- Step 2 (Reset section): every option of the card goes back to its default; the pill hides and focus moves to the card title.
- Step 3: a toast says "Where answers show is back to defaults" with Undo; Undo puts back the values from before the reset.

## Visible affordances

- The pill is the one reset look on the page: a rounded outline with a reset icon and the words "Reset section".

## Failure-mode expectations

- A failed write shows "Not saved" with the reason and keeps the changed values.

## Cautions

- Reset covers Show confidence pill, Hide the pill below, Show the original text at the top, Close when I click outside and Let me drag the tooltip; never the mode.
