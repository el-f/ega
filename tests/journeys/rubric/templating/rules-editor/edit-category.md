# Rules-editor edit-category rubric

## Latency budgets

- Type select change -> storage write: <= 200ms.

## State expectations

- Step 1: a rule is seeded with `category = 'always'`; its meta line starts "Always".
- Step 2: the user opens the row with Edit and changes Type from "Always" to "Never".
- Step 3: storage writes the rule with `category = 'never'`; the meta line starts "Never".

## Visible affordances

- Type is a labelled select inside the open row with five options: Always, Never, Prefer, Format, Other.
- The stored value `unknown` reads as "Other"; no raw value shows.

## Failure-mode expectations

- Only valid types are options.
- A failed write surfaces a "Not saved" toast; there is no inline error.

## Cautions

- The change is a direct storage write; there is no Save button.
- The type sets the rule's prefix in the compiled prompt ("Never: ", "Always: " …); "never" rules are still sent.
