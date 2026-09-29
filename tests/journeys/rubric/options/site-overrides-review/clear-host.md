# Site-overrides-review clear-host rubric

## Latency budgets

- Clear click -> storage write + row removal: <= 200ms.

## State expectations

- Step 1: site-overrides review surface lists hosts with overrides.
- Step 2 (click Clear on a row): the host entry is removed from `sitePrefs`.
- Step 3: the row disappears from the list; the host returns to global defaults across surfaces.

## Visible affordances

- The Clear button uses a subtle danger-tone token (warmer red); icon-only is acceptable here with a clear aria-label.

## Failure-mode expectations

- Clear has NO confirm — the entry is recoverable on the source surface (smart-bubble dismiss, picker per-site setting).
- Storage write failure surfaces an inline error; the row reverts.

## Cautions

- Per-row clear is intentionally friction-light — confirm would add unhelpful interruption.
- Bulk Clear (clear-all) has a confirm; per-row does not.
