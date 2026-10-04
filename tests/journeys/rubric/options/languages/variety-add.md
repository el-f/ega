# Options-languages variety-add rubric

## Latency budgets

- Form submit -> row appears in list: <= 200ms.

## State expectations

- Step 1: user opens the add form with the header "Add custom language" (+) button.
- Step 2: user fills Label + Hint; clicks Add.
- Step 3: a new entry lands in `customLanguages`; the form clears and closes, an "Added "<label>"." toast shows, and the new row flashes and scrolls into view.

## Visible affordances

- Add button uses the primary action tokens; Cancel is a secondary affordance.
- Label + Hint fields have clear labels and are marked required; add errors appear inline in the form, above the Add button.

## Failure-mode expectations

- Empty label or hint keeps Add disabled, with a "Label and hint are required." tooltip.
- At the 200-language cap, an inline error says to delete one before adding another.

## Cautions

- The new variety must be usable immediately in language pickers across all surfaces (no refresh required).
