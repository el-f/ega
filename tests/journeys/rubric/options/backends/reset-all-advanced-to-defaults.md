# Options-backends reset-all-advanced-to-defaults rubric

## Latency budgets

- Reset click -> storage reset + toast: <= 600ms.

## State expectations

- Step 1: in Advanced > Data, the Reset and delete card has the row "Reset prompt and model settings" with the line "Puts back the Translate prompt, Effort, creativity and answer length" and a secondary "Reset".
- Step 2 (click Reset): no dialog; the Translate prompt, Effort, temperature and max answer length go back to their defaults at once.
- Step 3: a toast "Prompt and model settings are back to defaults" offers Undo; Undo writes the old values back.

## Visible affordances

- Reset is a secondary button; its accessible description is its row line.
- The card's (i) "About resets" says what is kept: language prompts, API keys, tasks and saved conversations.

## Failure-mode expectations

- A storage write failure shows a "Not saved" toast; no Undo toast shows.

## Cautions

- Site overrides are NOT reset; they have their own card.
- API keys and per-language prompt overrides are not affected.
