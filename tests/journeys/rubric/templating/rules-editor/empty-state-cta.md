# Rules-editor empty-state-cta rubric

## Latency budgets

- Mount with empty rules -> empty-state render: <= 200ms.

## State expectations

- Step 1: user navigates to the rules editor with `rules === []`.
- Step 2: the empty state mounts with a heading + body + "Pick a recipe" primary CTA + secondary "Add manually" link.
- Step 3 (click "Pick a recipe"): navigates to the recipes gallery.

## Visible affordances

- Empty state uses the project's empty-state pattern (illustration / icon + heading + body).
- CTA is a primary button; secondary link uses muted styling.

## Failure-mode expectations

- A rules list with all-disabled rules is NOT empty — the empty state only renders on `rules.length === 0`.

## Cautions

- The empty state must speak in the project's empty-state voice ("Add your first rule") — not error-toned.
- "Add manually" must surface the manual add form inline without navigation.
