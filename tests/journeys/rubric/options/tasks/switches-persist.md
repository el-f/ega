# Options-tasks switches-persist rubric

## Latency budgets

- Each control change -> storage write: <= 200ms.

## State expectations

- Step 1: the user opens Edit on Summarize and picks High in Effort, then checks Send page context and Use glossary.
- Step 2: `taskOverrides.summarize` is {effort: "high", pageContext: true, glossary: true}; the footer reads "Saved".
- Step 3: after a reload the row shows "Edited" and the dialog shows the same three values.

## Visible affordances

- Effort is one segmented control: Default, Off, Low, Medium, High, with the line "Default for this task is <level>" under it.
- Settings come first and the prompt second; the answer shape and images line ("Answer only · Text only") are text, not controls.

## Failure-mode expectations

- A storage write failure shows "Not saved" with the reason in the footer; the stored edit is unchanged.

## Cautions

- A value equal to the shipped one is not stored, so turning a switch back to its built-in value removes it from the edit.
