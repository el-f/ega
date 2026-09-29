# Rules-editor edit-category-in-advanced rubric

## Latency budgets

- Category select change -> storage write: <= 200ms.

## State expectations

- Step 1: a rule is seeded with `category = 'always'`; user opens the Advanced disclosure.
- Step 2: user changes the category select from "always" to "never".
- Step 3: storage writes the updated rule with `category = 'never'`; the rule row reflects the new category badge.

## Visible affordances

- Category select is visible inside the Advanced disclosure alongside other advanced rule fields.
- The category badge on the rule row updates immediately after the select change.

## Failure-mode expectations

- Selecting an invalid / empty category value (defensive) is blocked at the select level — only valid enum values are options.
- Storage write failure reverts the select to the prior value; an inline error appears.

## Cautions

- Category change is a direct storage write on select commit — there is no separate Save button for individual field edits inside Advanced.
- The `category` field affects how the rule is rendered in the compiled prompt; "never" rules are excluded from the system prompt entirely.
