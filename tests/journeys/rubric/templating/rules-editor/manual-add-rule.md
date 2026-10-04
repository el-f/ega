# Rules-editor manual-add-rule rubric

## Latency budgets

- Submit -> rule persists + appears in list: <= 200ms.

## State expectations

- Step 1: user opens the "Add a rule" section below the rules list.
- Step 2: user types the rule text (tasks and sites are optional); clicks "Add rule". The category is detected from the text.
- Step 3: a new rule row appears at the bottom of the rules list with the entered values; form clears.

## Visible affordances

- Form fields are labeled; "Add rule" is the primary action. There is no Cancel button; the section collapses via its summary.
- Body field is labeled "Rule text" with an example placeholder; input is capped at 500 characters (no visible count).

## Failure-mode expectations

- "Add rule" is disabled while the rule text is empty (whitespace only counts as empty); no inline validation message.
- A duplicate body is added as a new rule with no prompt.

## Cautions

- The rule must be created with `enabled === true` by default — the user added it for a reason.
- Manual-add bypasses the LLM meta-prompt path; it's a direct write.
