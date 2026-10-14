# Options-languages variety-edit-save rubric

## Latency budgets

- Typing pause -> storage write: <= 1s (600 ms pause, then the write).

## State expectations

- Step 1: the user opens a language with Edit; the dialog "Edit <name>" opens.
- Step 2: the user edits Notes.
- Step 3: the notes persist to `varietyOverrides[id]` for a built-in, or the `customLanguages` entry for a custom; the footer says "Saved".

## Visible affordances

- Notes is a plain-font field that grows with its text, with a "366 / 500" style counter.
- "Auto-detect pattern" is a disclosure with an (i); it holds Pattern, Flags ("i ignores case") and Minimum matches.
- A built-in that differs from the shipped one shows a "Reset language" pill in the footer.

## Failure-mode expectations

- A pattern the browser cannot compile is marked on the field: "This pattern is not valid. Check the brackets and slashes." Nothing is saved.
- A pattern that can freeze the page on long text says so on the field and is not saved.
- If another window changed the same field, the dialog shows "Changed in another window" with "Reload language", saves nothing, and the footer says "Not saved: it changed in another window".

## Cautions

- Each write sends only the field that changed; other fields are kept.
