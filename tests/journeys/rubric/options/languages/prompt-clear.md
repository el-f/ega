# Options-languages prompt-clear rubric

## Latency budgets

- Click -> editor or row update visible: <= 300ms.

## State expectations

- Step 1: the user opens the Languages tab and edits one language row (Clear a language prompt).
- Step 2: the user presses Clear in the Arabizi prompt editor.
- Step 3: the `arabizi` key is gone from `perPresetTemplates`, so Arabizi uses the Translate prompt again.
- Step 4: a "Language prompt cleared." toast offers Undo; Undo writes the same prompt back.

## Visible affordances

- "Prompt for this language" sits at the bottom of the language row, below Save and Reset to built-in.
- The prompt editor has its own Save; it does not save the hint or examples.

## Failure-mode expectations

- A language prompt applies to Translate and Explain only, and only when that language is the source.

## Cautions

- The language row is the only place a language prompt is edited.
