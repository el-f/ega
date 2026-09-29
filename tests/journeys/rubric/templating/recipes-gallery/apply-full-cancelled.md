# Recipes-gallery apply-full-cancelled rubric

## Latency budgets

- Confirm dialog Cancel click -> dialog closes: <= 100ms.

## State expectations

- Step 1: user clicks "Apply" (full) on a recipe card; the confirm dialog mounts.
- Step 2 (click Cancel in the confirm dialog): the dialog closes.
- Step 3: storage is unchanged — `templates` and `rules` remain as they were before Apply was clicked.

## Visible affordances

- Cancel is the secondary action in the confirm dialog; it uses neutral styling.
- After cancel, the gallery card remains in its default state with Apply available again.

## Failure-mode expectations

- N/A — cancel is the safe path; no error state possible.

## Cautions

- Storage must be verified unchanged AFTER cancel (not just assumed) — a regression could write before the confirm step.
- The Undo toast must NOT appear after a canceled Apply.
