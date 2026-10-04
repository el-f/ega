# Site-overrides-review clear-all rubric

## Latency budgets

- Confirm click -> sitePrefs empty: <= 300ms.

## State expectations

- Step 1: site-overrides-review lists multiple hosts; a Clear-all action is visible.
- Step 2 (click Clear-all): a "Clear all site overrides" danger confirm names the number of hosts (rows) to be cleared.
- Step 3 (confirm): `sitePrefs` empties; the list shows the empty state.

## Visible affordances

- Clear-all uses the danger tone tokens; the confirm dialog's "Clear all" button uses the danger variant.

## Failure-mode expectations

- Cancel leaves `sitePrefs` untouched.
- A write failure shows a "Change not saved" warning toast; the dialog is already closed and the list keeps its rows.

## Cautions

- Clear-all is destructive at the bulk level — confirm is non-negotiable.
- The action does NOT clear other surface settings (custom languages, audit log) — it's scoped to `sitePrefs` only.
