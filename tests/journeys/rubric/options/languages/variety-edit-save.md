# Options-languages variety-edit-save rubric

## Latency budgets

- Save click -> storage write: <= 300ms.
- "Saved ✓" ack visible: <= 400ms after click.

## State expectations

- Step 1: user expands a variety row into edit mode; edits the hint field.
- Step 2 (click Save): the updated hint persists to the matching `customLanguages` entry in storage.
- Step 3: a brief "Saved ✓" inline ack appears next to the Save button; the row exits edit mode.

## Visible affordances

- Edit mode surfaces text fields for label, hint, and base language.
- Save button is primary action; Discard is secondary.
- "Saved ✓" ack uses the success tone tokens; auto-dismisses after ~1.5s.

## Failure-mode expectations

- Saving with an empty label surfaces inline validation; Save is disabled.
- Storage write failure surfaces an inline error; row stays in edit mode.

## Cautions

- Save only updates the fields the user explicitly changed; all other variety properties are preserved.
- Settings write must go through `updateSettings` so deep-merge + lock invariants hold.
