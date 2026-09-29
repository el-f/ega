# Recipes-gallery export-user-recipe rubric

## Latency budgets

- Export click -> clipboard write: <= 300ms.

## State expectations

- Step 1: user is on the "Yours" tab with at least one user recipe.
- Step 2 (click Export on a recipe card): the recipe is serialized and base64-encoded.
- Step 3: the encoded string is written to the clipboard; a success toast confirms ("Copied to clipboard").

## Visible affordances

- Export button on each user recipe card (hidden or absent on bundled recipes).
- Success toast is brief and auto-dismisses.

## Failure-mode expectations

- Clipboard permission denied surfaces an inline error in place of the success toast.
- The exported string must be decodable by the "Paste shared" flow — round-trip integrity is expected.

## Cautions

- The encoded payload must NOT include the user's API keys or any sensitive settings data — only the recipe content (label, description, task, rules, template).
- Export of a bundled recipe is not exposed via this action (bundled recipes are distribution-bundled already).
