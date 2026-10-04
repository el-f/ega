# Options-languages variety-toggle-enabled rubric

## Latency budgets

- Checkbox toggle -> storage write: <= 200ms.

## State expectations

- Step 1: user sees a language row with the enabled checkbox checked.
- Step 2 (uncheck): the language id is added to `disabledVarieties` in storage; the checkbox stays unchecked (no badge).
- Step 3 (re-check): the language id is removed from `disabledVarieties`.
- Unchecking the default source or target language shows a warning toast that names the role and says Ega still uses it until another default is picked on the Translate tab; other languages show no toast.

## Visible affordances

- Checkbox on each row, named "Enable <label>"; no Disabled badge — the unchecked box is the only cue.
- Disabled languages are still listed in the row (not hidden) so the user knows they exist.

## Failure-mode expectations

- Storage write failure shows a "Change not saved: …" warning toast; the checkbox does not revert.

## Cautions

- Toggle takes effect on the next translation dispatch; mounted tooltips are not updated mid-session.
- `disabledVarieties` stores ids, not labels; renaming a language does not accidentally re-enable a disabled one.
