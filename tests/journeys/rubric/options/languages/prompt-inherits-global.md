# Options-languages prompt-inherits-global rubric

## Latency budgets

- Radio click -> editor visible: <= 300ms.

## State expectations

- Step 1: a language without its own prompt opens on "Use the Translate prompt".
- Step 2: "Use its own prompt" shows an editor that starts from the Translate prompt.
- Step 3: nothing is stored until a half differs from the Translate prompt.

## Visible affordances

- "Prompt" is the last part of the language dialog: two radios, "Use the Translate prompt" and "Use its own prompt". The shared prompt editor shows under them only for "Use its own prompt".
- There is no Save prompt button: the prompt saves as it changes, and the footer says "Saved".

## Failure-mode expectations

- A language prompt applies to Translate and Explain only, and only when that language is the source.

## Cautions

- The language dialog is the only place a language prompt is edited.
