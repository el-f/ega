# Options-languages prompt-own-label rubric

## Latency budgets

- Click -> editor or row update visible: <= 300ms.

## State expectations

- Step 1: the user opens the Languages tab and edits one language row (Which languages have their own prompt).
- Step 2: a language with its own prompt says "This language has its own prompt" and offers Edit prompt; one without says "Uses the Translate prompt" and offers Write a prompt.
- Step 3: opening and closing rows writes nothing.

## Visible affordances

- "Prompt for this language" sits at the bottom of the language row, below Save language and Reset to built-in.
- The prompt editor has its own Save prompt button; it does not save the hint or examples.

## Failure-mode expectations

- A language prompt applies to Translate and Explain only, and only when that language is the source.

## Cautions

- The language row is the only place a language prompt is edited.
