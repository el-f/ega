# Recipes-gallery delete-user-recipe rubric

## Latency budgets

- Delete click -> confirm dialog: <= 100ms.
- Confirm -> `userRecipes` write: <= 200ms.

## State expectations

- Step 1: user is on the "Yours" tab with at least one user recipe.
- Step 2 (click Delete on a recipe card): a confirm dialog surfaces naming the recipe to be removed.
- Step 3 (confirm): the recipe entry is removed from `userRecipes`; the card disappears from the gallery.

## Visible affordances

- Confirm dialog uses warning tone tokens.
- If deleting the last user recipe, the "Yours" tab shows the empty state after removal.

## Failure-mode expectations

- Cancel leaves `userRecipes` unchanged; the card remains visible.
- Storage write failure surfaces an inline error; the card stays visible.

## Cautions

- Deleting a user recipe is permanent; there is no Undo.
- Bundled recipes (in the "Bundled" tab) do not have a Delete affordance — this action applies to user recipes only.
