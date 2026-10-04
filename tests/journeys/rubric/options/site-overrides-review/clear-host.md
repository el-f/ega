# Site-overrides-review clear-host rubric

## Latency budgets

- Clear click -> storage write + row removal: <= 200ms.

## State expectations

- Step 1: site-overrides review surface lists hosts with overrides.
- Step 2 (click Clear on a row): a "Clear site override" confirm opens; confirming removes the row's keys (both schemes for a merged row) from `sitePrefs`.
- Step 3: the row disappears from the list; the host returns to global defaults across surfaces.

## Visible affordances

- The Clear control is a danger-tone X IconButton with the tooltip "Clear" and aria-label "Clear override for <host>".

## Failure-mode expectations

- Clear asks for confirmation first; Cancel leaves `sitePrefs` untouched.
- A write failure shows a "Change not saved" warning toast; the row stays in the list.

## Cautions

- Both per-row Clear and Clear-all ask for confirmation.
