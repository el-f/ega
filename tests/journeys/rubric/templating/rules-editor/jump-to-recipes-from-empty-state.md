# Rules-editor jump-to-recipes-from-empty-state rubric

## Latency budgets

- CTA click -> workbench chip switches to recipes: <= 150ms.

## State expectations

- Step 1: rules editor shows the empty state with a "Pick a recipe" CTA.
- Step 2 (click "Pick a recipe"): the workbench chip switches to the recipes-gallery surface.
- Step 3: the recipes gallery mounts with the "Bundled" tab active.

## Visible affordances

- "Pick a recipe" is a primary button in the empty state.
- After the jump, the recipes chip in the workbench chip rail is active/highlighted.

## Failure-mode expectations

- N/A — this is a navigation action; no storage writes occur.

## Cautions

- The jump must navigate within the same workbench panel — it must NOT open a new window or full-panel navigation.
- The empty state does not dismiss before the chip switch is confirmed — no flash of empty state remaining visible after click.
