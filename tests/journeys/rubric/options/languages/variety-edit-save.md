# Options-languages variety-edit-save rubric

## Latency budgets

- Save click -> storage write: <= 300ms.
- "Saved ✓" ack visible: <= 400ms after click.

## State expectations

- Step 1: user expands a variety row into edit mode; edits the hint field.
- Step 2 (click Save language): the updated hint persists to `varietyOverrides[id]` for a built-in, or the matching `customLanguages` entry for a custom.
- Step 3: a brief "Saved ✓" inline ack appears next to the Save language button; the editor stays open.

## Visible affordances

- Edit mode surfaces a Hint field with a character counter, an Examples list and a collapsed "Advanced: auto-detect pattern" block (Pattern, Flags, Minimum matches) that opens on click or when Save finds an invalid pattern; custom rows also get a Label field.
- "Save language" is primary; "Discard changes" shows while the draft differs from the saved language; "Reset to built-in" is secondary and shows only on an edited built-in.
- "Saved ✓" ack uses the success tone tokens; auto-dismisses after ~1.5s.

## Failure-mode expectations

- Save is never disabled; a custom row saved with an empty label keeps its old label.
- Storage write failure shows a danger toast ("Could not save …"); the editor stays open.
- A pattern the browser cannot compile, or one that nests a repeat like (a+)+, shows a danger toast and saves nothing.
- An emptied pattern removes a custom language's detection; on a built-in it goes back to the shipped pattern.

## Cautions

- Save only updates the fields the user explicitly changed; all other variety properties are preserved.
- Built-in saves write via `replaceVarietyOverrides` (settings lock, no deep merge), custom saves via `updateCustomLanguageRow` (customs lock; refuses a row another window deleted).
