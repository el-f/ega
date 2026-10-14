# Site-overrides-review clear-host rubric

## Latency budgets

- Remove click -> storage write + row removal: <= 200ms.

## State expectations

- Step 1: the Site overrides card lists hosts with overrides.
- Step 2 (click the trash button on a row): the row's keys (both schemes for a merged row) leave `sitePrefs` at once; a toast "Removed <site>" offers Undo.
- Step 3: the row disappears and focus moves to the next row's trash button (or the previous one, or the card title); the host returns to global defaults across surfaces.

## Visible affordances

- The control is a trash IconButton named "Remove <site>"; there is no confirm dialog.

## Failure-mode expectations

- A write failure shows a "Not saved" toast with Try again; the row stays in the list.

## Cautions

- Undo puts the removed entry back unless the site changed since; the newer value wins.
