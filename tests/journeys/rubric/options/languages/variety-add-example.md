# Options-languages variety-add-example rubric

## Latency budgets

- "Add example" click -> new example row appears: <= 100ms.
- Save with example -> storage write: <= 300ms.

## State expectations

- Step 1: user is in edit mode for a variety; an "Add another example" button is visible.
- Step 2 (click Add another example): a new empty source+target pair row is appended to the examples list.
- Step 3: user fills both fields; clicks Save; "Saved ✓" shows and the `{src, tgt}` pair lands in `examples` (built-in: `varietyOverrides[id]`; custom: its `customLanguages` entry).

## Visible affordances

- Each example row shows a source field, a target field, and a remove icon.
- "Add another example" is a small secondary text button (no icon).

## Failure-mode expectations

- Save is never blocked; rows with both fields empty are dropped on Save, half-filled rows are kept.
- Removing all examples from an existing variety is valid; `examples` becomes an empty array in storage.

## Cautions

- Examples guide translation style in the prompt. The UI caps them at 20 (built-in) / 50 (custom); past the cap a warning toast "Example limit is N — remove one before adding another." shows.
- Built-in edits write via `replaceVarietyOverrides` (settings lock, no deep merge), custom edits via `updateCustomLanguageRow` (customs lock; refuses a row another window deleted); partial writes (some examples missing) must not occur.
