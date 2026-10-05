# Options-languages prompt-save rubric

## Latency budgets

- Click -> editor or row update visible: <= 300ms.

## State expectations

- Step 1: the user opens the Languages tab and edits one language row (Save a language prompt).
- Step 2: the user edits the System field in the Arabizi prompt editor and presses Save prompt.
- Step 3: `perPresetTemplates.arabizi` holds the edited text; the Translate prompt is unchanged.

## Visible affordances

- "Prompt for this language" sits at the bottom of the language row, below Save language and Reset to built-in.
- The prompt editor has its own Save prompt button; it does not save the hint or examples.

## Failure-mode expectations

- A language prompt applies to Translate and Explain only, and only when that language is the source.

## Cautions

- The language row is the only place a language prompt is edited.
