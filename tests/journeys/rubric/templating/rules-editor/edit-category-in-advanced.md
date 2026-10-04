# Rules-editor edit-category-in-advanced rubric

## Latency budgets

- Category select change -> storage write: <= 200ms.

## State expectations

- Step 1: a rule is seeded with `category = 'always'`; user opens the Advanced disclosure.
- Step 2: user changes the category select from "always" to "never".
- Step 3: storage writes the updated rule with `category = 'never'`; the row's category select shows "never" in the danger color.

## Visible affordances

- Category select is visible inside the Advanced disclosure alongside other advanced rule fields.
- The category select recolors to match the saved value (never = danger color).

## Failure-mode expectations

- Selecting an invalid / empty category value (defensive) is blocked at the select level — only valid enum values are options.
- Storage write failure surfaces a "Change not saved" warning toast; there is no inline error.

## Cautions

- Category change is a direct storage write on select commit — there is no separate Save button for individual field edits inside Advanced.
- The `category` field sets the rule's prefix in the compiled prompt ("Never: ", "Always: " …); "never" rules are still sent.
