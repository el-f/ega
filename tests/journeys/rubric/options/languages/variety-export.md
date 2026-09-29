# Options-languages variety-export rubric

## Latency budgets

- Export click -> download triggered: <= 300ms.

## State expectations

- Step 1: user clicks the Export button.
- Step 2: a JSON file containing all `customLanguages` entries downloads.
- Step 3: a toast confirms the export with the filename.

## Visible affordances

- Export button uses a download icon; carries an accessible name.
- The toast carries a "Show file" affordance where the OS supports it.

## Failure-mode expectations

- No custom varieties configured -> Export is disabled with explanatory tooltip.
- Browser blocks the download (rare) -> inline notice with retry.

## Cautions

- Export is read-only — it never mutates `customLanguages`.
- The exported JSON is plain text; no encoding or compression.
- Filename includes the export date (no spaces) so multiple exports don't collide.
