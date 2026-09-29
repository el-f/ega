# Recipes-gallery save-current-as-recipe rubric

## Latency budgets

- Save dialog submit -> `userRecipes` write: <= 300ms.
- Gallery switch to "Yours" tab: <= 150ms.

## State expectations

- Step 1: user clicks "+ New from current" in the gallery.
- Step 2: a dialog opens with a label input field and optional description.
- Step 3 (fill label and submit): a new entry is added to `userRecipes` in storage; the gallery switches to the "Yours" tab displaying the new recipe.

## Visible affordances

- Dialog heading: "New recipe from current"; help text: "Save one task's template, rules and generation settings as a recipe you can reuse."
- Submit is primary; Cancel is secondary.
- After save, the "Yours" tab is active with the new recipe card visible.

## Failure-mode expectations

- Empty label blocks submit; inline validation surfaces the requirement.
- Cancel leaves `userRecipes` unchanged and keeps the gallery on the current tab.

## Cautions

- "New from current" captures the CURRENT template body + rules at the moment of save — not a live reference.
- The saved recipe appears in the "Yours" tab immediately without a page reload.
