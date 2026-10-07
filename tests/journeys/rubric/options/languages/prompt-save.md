# Options-languages prompt-save rubric

## Latency budgets

- Typing pause -> storage write: <= 1s.

## State expectations

- Step 1: the user opens Arabizi with Edit and picks "Use its own prompt"; the editor starts from the Translate prompt.
- Step 2: the user edits the System field.
- Step 3: `perPresetTemplates.arabizi` holds only the half that differs; the Translate prompt is unchanged.

## Visible affordances

- "Prompt" is the last part of the language dialog: two radios, "Use the Translate prompt" and "Use its own prompt". The shared prompt editor shows under them only for "Use its own prompt".
- There is no Save prompt button: the prompt saves as it changes, and the footer says "Saved".

## Failure-mode expectations

- A language prompt applies to Translate and Explain only, and only when that language is the source.

## Cautions

- The language dialog is the only place a language prompt is edited.
