# Recipes-gallery bundled-list-renders rubric

## Latency budgets

- Mount -> full gallery render: <= 400ms.

## State expectations

- Step 1: user navigates to the recipes gallery surface.
- Step 2: bundled recipes render grouped by task with heading + count.
- Step 3: each recipe card carries title + summary + tags + apply controls.

## Visible affordances

- Group headings use the project type-scale; cards use consistent spacing tokens.
- A subtle separator distinguishes groups.

## Failure-mode expectations

- Bundled-recipes load failure (impossible — they're shipped with the extension) -> empty state with a "Reload" affordance.

## Cautions

- The gallery is read-only — bundled recipes cannot be edited or deleted.
- Layout must wrap cleanly across viewport widths typical for Options.
