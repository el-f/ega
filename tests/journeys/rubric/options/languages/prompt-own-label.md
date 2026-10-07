# Options-languages prompt-own-label rubric

## Latency budgets

- Edit -> dialog with the right radio checked: <= 300ms.

## State expectations

- Step 1: the user opens a language that has its own prompt: "Use its own prompt" is checked and the editor shows.
- Step 2: the user opens one that has none: "Use the Translate prompt" is checked and no editor shows.
- Step 3: opening and closing the dialogs writes nothing.

## Visible affordances

- "Prompt" is the last part of the language dialog: two radios, "Use the Translate prompt" and "Use its own prompt". The shared prompt editor shows under them only for "Use its own prompt".
- There is no Save prompt button: the prompt saves as it changes, and the footer says "Saved".

## Failure-mode expectations

- A language prompt applies to Translate and Explain only, and only when that language is the source.

## Cautions

- The language dialog is the only place a language prompt is edited.
