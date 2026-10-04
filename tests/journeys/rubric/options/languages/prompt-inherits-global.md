# Options-languages prompt-inherits-global rubric

## Latency budgets

- Click -> editor or row update visible: <= 300ms.

## State expectations

- Step 1: the user opens the Languages tab and edits one language row (A language without its own prompt).
- Step 2: the row says "Uses the Translate prompt"; Write a prompt opens an editor that starts from the Translate prompt.
- Step 3: nothing is stored until the user saves.

## Visible affordances

- "Prompt for this language" sits at the bottom of the language row, below Save and Reset to built-in.
- The prompt editor has its own Save; it does not save the hint or examples.

## Failure-mode expectations

- A language prompt applies to Translate and Explain only, and only when that language is the source.

## Cautions

- The language row is the only place a language prompt is edited.
