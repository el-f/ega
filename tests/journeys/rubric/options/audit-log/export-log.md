# Options-audit-log export-log rubric

## Latency budgets

- Export click -> download triggered: <= 400ms.

## State expectations

- Step 1: audit-log panel has at least one entry visible (filtered or unfiltered).
- Step 2 (click "Export as JSON"): a JSON file downloads with every log entry and a header (exportedAt, extension version, user agent).
- Step 3: no toast; the browser's download UI is the only confirmation.

## Visible affordances

- Export is a text button "Export as JSON" with no icon.

## Failure-mode expectations

- Export is disabled only when the log is empty; a filter with zero matches leaves it enabled.

## Cautions

- Export always writes the full log, whatever filters are active.
- Filename includes export date (no spaces).
