# Site-overrides-review clear-all rubric

## Latency budgets

- Remove all click -> sitePrefs empty: <= 300ms.

## State expectations

- Step 1: the Site overrides card lists several hosts; "Remove all" is in its header.
- Step 2 (click Remove all): `sitePrefs` empties at once; the card shows its empty state and Remove all goes away. A toast says "Removed N site overrides" (N counts rows) with Undo.
- Step 3 (Undo): every removed entry comes back and the rows return.

## Visible affordances

- Remove all is a secondary button, not red; there is no confirm dialog.
- Focus moves to the card title after the rows are gone.

## Failure-mode expectations

- A write failure shows a "Not saved" toast with Try again; the list keeps its rows and no Undo toast shows.

## Cautions

- The action does NOT clear other settings (custom languages, the request list) — it's scoped to `sitePrefs` only.
- Undo keeps a site that changed after the remove at its newer value.
