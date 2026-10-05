# Options-languages prompt-open-editor rubric

## Latency budgets

- Click -> editor or row update visible: <= 300ms.

## State expectations

- Step 1: the user opens the Languages tab and edits one language row (Open the language prompt editor).
- Step 2: Write a prompt shows the prompt editor inside the language row: Variables, System, User, Save prompt.
- Step 3: the editor stays inside the row; no dialog opens.

## Visible affordances

- "Prompt for this language" sits at the bottom of the language row, below Save language and Reset to built-in.
- The prompt editor has its own Save prompt button; it does not save the hint or examples.

## Failure-mode expectations

- A language prompt applies to Translate and Explain only, and only when that language is the source.

## Cautions

- The language row is the only place a language prompt is edited.
