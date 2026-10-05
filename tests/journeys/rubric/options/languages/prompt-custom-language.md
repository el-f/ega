# Options-languages prompt-custom-language rubric

## Latency budgets

- Click -> editor or row update visible: <= 300ms.

## State expectations

- Step 1: the user opens the Languages tab and edits one language row (Prompt for a custom language).
- Step 2: the custom language row has the same Prompt for this language section; Save prompt stores the prompt under the custom id.
- Step 3: `perPresetTemplates[<custom id>]` holds the text.

## Visible affordances

- "Prompt for this language" sits at the bottom of the language row, below Save language and Reset to built-in.
- The prompt editor has its own Save prompt button; it does not save the hint or examples.

## Failure-mode expectations

- A language prompt applies to Translate and Explain only, and only when that language is the source.

## Cautions

- The language row is the only place a language prompt is edited.
