# Options-tasks required-missing-blocks-save rubric

## Latency budgets

- Edit -> footer status: <= 100ms.

## State expectations

- Step 1: the user removes `{{text}}` from the Translate Message.
- Step 2: the error shows under Message and the footer reads "Not saved: the message needs the Selected text variable".
- Step 3: storage keeps the old Message.

## Visible affordances

- There is no Save button: every valid field saves as it changes; the footer status says what happened.

## Failure-mode expectations

- Closing now asks "Close without this change?" with "Keep editing" focused.

## Cautions

- An invalid field never overwrites the stored value.
