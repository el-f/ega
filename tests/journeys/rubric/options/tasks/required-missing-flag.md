# Options-tasks required-missing-flag rubric

## Latency budgets

- Edit that removes {{text}} -> error under Message: <= 100ms.

## State expectations

- Step 1: the stored Translate prompt's Message lacks `{{text}}` and its Instructions use `{{nope}}`.
- Step 2: the dialog opens with an error under Message: "The message needs the Selected text variable. Add it with Insert variable." The field is marked invalid.
- Step 3: a warning line says "{{nope}} is not a variable, so it will be empty".

## Visible affordances

- The error is in the error colour, tied to the field (aria-describedby); warnings are in the warning colour and never block.

## Failure-mode expectations

- The invalid Message is not saved; other fields still save.

## Cautions

- No chip row and no badge carry this state any more; the line under the field does.
