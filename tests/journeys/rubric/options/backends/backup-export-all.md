# Options-backends backup-export-all rubric

## Latency budgets

- Export click -> download triggered: <= 500ms.
- Status line visible: <= 600ms after click.

## State expectations

- Step 1: user navigates to Advanced > Data; the Export section is visible.
- Step 2 (click Export → All settings): a JSON file containing all settings (API keys stripped) downloads.
- Step 3: a status line confirms the export filename and that keys were excluded.

## Visible affordances

- Export button uses a download icon with an accessible label.
- Status line uses the success tone tokens; shows the filename + key-exclusion notice.

## Failure-mode expectations

- Browser download blocked -> inline notice with retry.
- Storage read failure (rare) -> inline error; no partial file is offered.

## Cautions

- API keys are NEVER included in the default export; the user must explicitly opt in (see backup-export-with-keys-confirm).
- The exported JSON is valid parseable settings; it can be fed directly into Import.
