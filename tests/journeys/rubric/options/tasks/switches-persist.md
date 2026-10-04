# Options-tasks switches-persist rubric

## Latency budgets

- Each control change -> storage write: <= 200ms.

## State expectations

- Step 1: the user opens Edit on Summarize and sets Effort to High, then checks Send page context and Use glossary.
- Step 2: `taskOverrides.summarize` is {effort: "high", pageContext: true, glossary: true}.
- Step 3: after a reload the row shows "Edited" and the dialog shows the same three values.

## Visible affordances

- Effort offers "Default (<level>)" first (the level the task ships with, else the Translate tab's Effort), then Off, Low, Medium and High.
- The answer shape and the images line are text, not controls.

## Failure-mode expectations

- A storage write failure shows a "Change not saved" warning toast; the stored edit is unchanged.

## Cautions

- A value equal to the shipped one is not stored, so turning a switch back to its built-in value removes it from the edit.
