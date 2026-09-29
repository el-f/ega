# Rules-editor manual-add-rule rubric

## Latency budgets

- Submit -> rule persists + appears in list: <= 200ms.

## State expectations

- Step 1: user opens the manual add form (under Advanced disclosure or empty-state CTA).
- Step 2: user fills category + body; clicks Add.
- Step 3: a new rule row appears at the bottom of the rules list with the entered values; form clears.

## Visible affordances

- Form fields are labeled; Add is the primary action; Cancel is a secondary affordance.
- Body field shows a character count or hint at typical length.

## Failure-mode expectations

- Empty body / missing category surfaces inline validation; Add is disabled until both are filled.
- Duplicate body (same as an existing rule) surfaces a confirm prompt before adding.

## Cautions

- The rule must be created with `enabled === true` by default — the user added it for a reason.
- Manual-add bypasses the LLM meta-prompt path; it's a direct write.
