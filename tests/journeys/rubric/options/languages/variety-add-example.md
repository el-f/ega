# Options-languages variety-add-example rubric

## Latency budgets

- "Add example" click -> new row with focus: <= 100ms.
- Typing pause -> storage write: <= 1s.

## State expectations

- Step 1: the user opens a language with Edit; Examples has column headers "Original" and "Translation".
- Step 2 (Add example): an empty pair is appended and focus moves into its Original field.
- Step 3: the user fills both fields; the pair lands in `examples` and the footer says "Saved".

## Visible affordances

- Each row has Original, Translation and a remove icon named "Remove example <n>".
- "Add example" is a ghost button with a plus icon.

## Failure-mode expectations

- Rows with both fields empty are not stored.
- At the cap (20 built-in, 50 custom) Add example stays focusable, aria-disabled, with "You have the most examples Ega keeps (N)".

## Cautions

- Writes go through the language writers' locks; a partial list is never written.
