# Recipes-gallery bundled-tab-to-yours-tab rubric

## Latency budgets

- Tab click -> panel switch: <= 100ms.

## State expectations

- Step 1: gallery defaults to the "Bundled" tab showing grouped recipe cards.
- Step 2 (click "Yours" tab): the panel switches to the user recipes list.
- Step 3: with no user recipes seeded, the empty state renders (illustration + heading + description).

## Visible affordances

- Active tab uses accent styling; inactive tab uses neutral styling.
- Empty state on "Yours" tab carries a call-to-action: "+ New from current" or "Paste shared recipe".

## Failure-mode expectations

- N/A — tab switch is non-destructive.

## Cautions

- The empty state must render the CTA buttons even when `userRecipes` is an empty array — not an error state.
- Tab state does NOT persist across navigation; gallery defaults to "Bundled" on re-entry.
