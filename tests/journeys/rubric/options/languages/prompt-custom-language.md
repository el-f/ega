# Options-languages prompt-custom-language rubric

## Latency budgets

- Typing pause -> storage write: <= 1s.

## State expectations

- Step 1: the user opens a custom language with Edit.
- Step 2: the dialog has the same Prompt radios; "Use its own prompt" and an edit store the prompt under the custom id.
- Step 3: `perPresetTemplates[<custom id>]` holds the text.

## Visible affordances

- "Prompt" is the last part of the language dialog: two radios, "Use the Translate prompt" and "Use its own prompt". The shared prompt editor shows under them only for "Use its own prompt".
- There is no Save prompt button: the prompt saves as it changes, and the footer says "Saved".

## Failure-mode expectations

- A language prompt applies to Translate and Explain only, and only when that language is the source.

## Cautions

- The language dialog is the only place a language prompt is edited.
