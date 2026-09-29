# Options-languages variety-add rubric

## Latency budgets

- Form submit -> row appears in list: <= 200ms.

## State expectations

- Step 1: user opens the Add variety form (button or empty-state CTA).
- Step 2: user fills label + base language; clicks Add.
- Step 3: a new row appears in `customLanguages` with the entered values; form clears.

## Visible affordances

- Add button uses the primary action tokens; Cancel is a secondary affordance.
- Label + base language fields have clear labels; validation hints appear inline.

## Failure-mode expectations

- Empty label / missing base language surfaces inline validation; Add is disabled until both are filled.
- Duplicate label surfaces a confirm prompt before adding.

## Cautions

- The new variety must be usable immediately in language pickers across all surfaces (no refresh required).
- Variety label must NOT collide with built-in language names.
