# Options-languages variety-toggle-enabled rubric

## Latency budgets

- Checkbox toggle -> storage write: <= 200ms.

## State expectations

- Step 1: user sees a language row with the enabled checkbox checked.
- Step 2 (uncheck): the language id is added to `disabledVarieties` in storage; the row shows a disabled badge.
- Step 3 (re-check): the language id is removed from `disabledVarieties`; the disabled badge disappears.

## Visible affordances

- Checkbox on each row; a "Disabled" badge appears next to the language label when unchecked.
- Disabled languages are still listed in the row (not hidden) so the user knows they exist.

## Failure-mode expectations

- Disabling a language that is currently set as the default target surfaces a warning toast; the language is still disabled and the default target falls back.
- Storage write failure surfaces an inline error; checkbox reverts to last persisted state.

## Cautions

- Toggle takes effect on the next translation dispatch; mounted tooltips are not updated mid-session.
- `disabledVarieties` stores ids, not labels; renaming a language does not accidentally re-enable a disabled one.
