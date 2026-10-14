# Options-audit-log export-log rubric

## Latency budgets

- Export click -> download triggered: <= 400ms.

## State expectations

- Step 1: the Recent requests card has at least one entry (filtered or unfiltered); "Export" shows in its header.
- Step 2 (click "Export"): a JSON file downloads with every log entry and a header (exportedAt, extension version, user agent).
- Step 3: no toast; the browser's download UI is the only confirmation.

## Visible affordances

- Export is a secondary button "Export" with no icon, next to Clear in the card header.

## Failure-mode expectations

- Export is hidden while the log is empty; a filter with zero matches leaves it in place.

## Cautions

- Export always writes the full log, whatever filters are active.
- Filename includes export date (no spaces).
