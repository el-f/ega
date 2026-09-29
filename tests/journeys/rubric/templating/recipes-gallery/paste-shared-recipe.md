# Recipes-gallery paste-shared-recipe rubric

## Latency budgets

- Decode + preview render: <= 300ms.
- Import confirm -> `userRecipes` write: <= 200ms.

## State expectations

- Step 1: user opens "Paste shared" dialog and pastes an encoded recipe payload string.
- Step 2 (click Preview): the payload is decoded; the recipe's label, description, rules, and template body are shown in a preview.
- Step 3 (click Import and confirm): the decoded recipe is added to `userRecipes` in storage.

## Visible affordances

- Dialog carries a textarea for the encoded string, a "Preview" action, and a separate "Import" action that appears after a successful preview.
- Preview panel shows the decoded recipe fields; confirm dialog surfaces before Import commits.

## Failure-mode expectations

- Invalid / garbage payload on Preview surfaces an inline error ("This does not look like a recipe code. …"); Import action does not appear.
- Cancel at any point leaves `userRecipes` unchanged.

## Cautions

- The preview step is mandatory — Import is only available after a successful decode.
- The imported recipe uses the same shape as bundled recipes (`id`, `label`, `description`, `task`, `rules`, `template`).
