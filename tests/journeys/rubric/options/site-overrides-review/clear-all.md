# Site-overrides-review clear-all rubric

## Latency budgets

- Confirm click -> sitePrefs empty: <= 300ms.

## State expectations

- Step 1: site-overrides-review lists multiple hosts; a Clear-all action is visible.
- Step 2 (click Clear-all): a confirm dialog surfaces naming the count of entries to be cleared.
- Step 3 (confirm): `sitePrefs` empties; the list shows the empty state.

## Visible affordances

- Clear-all uses the danger tone tokens; the confirm dialog uses warning tokens.

## Failure-mode expectations

- Cancel leaves `sitePrefs` untouched.
- A partial write failure (extremely rare) surfaces an inline error; the dialog stays open.

## Cautions

- Clear-all is destructive at the bulk level — confirm is non-negotiable.
- The action does NOT clear other surface settings (custom languages, audit log) — it's scoped to `sitePrefs` only.
