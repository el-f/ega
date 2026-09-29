# Slot-palette define-custom-variable-over-cap rubric

## Latency budgets

- Submit with a capped description -> dialog closes: <= 300ms.

## State expectations

- Step 1: the user opens the Define dialog and types a name plus a description longer than the
  280-character cap (paste is the realistic path).
- Step 2: the field stops the value at 280 characters as it is entered.
- Step 3: submit succeeds, because what the field holds is already inside the cap.
- Step 4: `advanced.customSlotDescriptions` gains exactly the 280-character value.

## Visible affordances

- The input carries `maxlength`, so typing and pasting both stop at the cap. That is the whole
  user-visible protection; the UI has no path to the error state.
- `submitDefine`'s length check stays as a writer-side backstop for a programmatic value. Unit
  tests cover it; this journey does not.

## Failure-mode expectations

- The rest of `advanced` — rules, snippets, templates, recipes — must be byte-identical afterwards.
  A repair that replaces the whole section on one bad field is data loss, not validation.
- Nothing longer than 280 characters may reach storage.

## Cautions

- Read the stored settings back after the submit; asserting only the dialog state would miss a
  partial write.
