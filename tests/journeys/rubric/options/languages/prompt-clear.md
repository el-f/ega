# Options-languages prompt-clear rubric

## Latency budgets

- Radio click -> stored prompt removed: <= 300ms.

## State expectations

- Step 1: Arabizi has its own prompt; its dialog opens on "Use its own prompt".
- Step 2: the user picks "Use the Translate prompt".
- Step 3: the `arabizi` key is gone from `perPresetTemplates`; the footer says "Uses the Translate prompt" with Undo.
- Step 4 (Undo): the same prompt is written back.

## Visible affordances

- "Prompt" is the last part of the language dialog: two radios, "Use the Translate prompt" and "Use its own prompt". The shared prompt editor shows under them only for "Use its own prompt".
- There is no Save prompt button: the prompt saves as it changes, and the footer says "Saved".

## Failure-mode expectations

- A language prompt applies to Translate and Explain only, and only when that language is the source.

## Cautions

- The language dialog is the only place a language prompt is edited.
