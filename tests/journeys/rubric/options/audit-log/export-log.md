# Options-audit-log export-log rubric

## Latency budgets

- Export click -> download triggered: <= 400ms.

## State expectations

- Step 1: audit-log panel has at least one entry visible (filtered or unfiltered).
- Step 2 (click Export): a JSON file downloads with the currently visible entries.
- Step 3: a toast confirms the export with the filename + entry count.

## Visible affordances

- Export uses a download icon; carries an aria-label.
- The toast carries a "Show file" affordance where the OS supports it.

## Failure-mode expectations

- Empty visible list (after filter) -> Export is disabled with explanatory tooltip.
- Browser download blocked -> inline notice with retry.

## Cautions

- Export reflects the CURRENTLY filtered list, not the full log — the visible filter is the export contract.
- Filename includes export date (no spaces).
