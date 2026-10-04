# Rules-editor manual-add-rule rubric

## Latency budgets

- Submit -> rule persists + appears in list: <= 200ms.

## State expectations

- Step 1: with no rules, user clicks the empty state's "Add a rule" button; with rules, the "Add a rule" section below the list.
- Step 2: user types the rule text (tasks and sites are optional); a line under the text shows the category guessed from it. User clicks "Add rule".
- Step 3: a new rule row appears at the bottom of the rules list with the entered values, scrolls into view and pulses once; the form clears and closes.

## Visible affordances

- Form fields are labeled in sentence case; "Add rule" is the primary action and "Cancel" closes and clears the form.
- Body field is labeled "Rule text" with an example placeholder; input is capped at 500 characters (no visible count).
- "Applies to" says that picking no task applies the rule to all tasks.

## Failure-mode expectations

- "Add rule" is disabled while the rule text is empty (whitespace only counts as empty); a visible line says to write the rule text.
- A duplicate body is added as a new rule with no prompt.

## Cautions

- The rule must be created with `enabled === true` by default — the user added it for a reason.
- Manual-add bypasses the LLM meta-prompt path; it's a direct write.
