# Rules-editor manual-add-rule rubric

## Latency budgets

- Add rule -> rule persists and appears in the list: <= 200ms.

## State expectations

- Step 1: with no rules, the user presses the empty state's "Add rule"; with rules, the header "Add rule".
- Step 2: the draft opens at the top of the card and focus moves to "Rule text". Type follows the text ("Always …" reads Always) until the user picks one.
- Step 3 (Add rule): the new rule row appears in the list, scrolls into view and pulses once; the draft closes and focus moves to the new rule's checkbox.

## Visible affordances

- Fields: "Rule text", "Type", "Applies to" (All tasks plus one toggle per task) and "Sites (optional)" with the hint "Separate sites with commas".
- "Add rule" is the primary action; "Cancel" closes the draft and returns focus to Add rule.

## Failure-mode expectations

- Add rule stays enabled; with an empty text it says "Write the rule text" and adds nothing.
- At 100 rules, Add rule is aria-disabled and the card says "You have the most rules Ega keeps (100)".

## Cautions

- The rule must be created with `enabled === true` — the user added it for a reason.
- Manual add is a direct write.
