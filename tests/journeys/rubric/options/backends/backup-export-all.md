# Options-backends backup-export-all rubric

## Latency budgets

- Export click -> download triggered: <= 500ms.
- Status line visible: <= 600ms after click.

## State expectations

- Step 1: user opens Advanced > Data; the "Backup & restore" card with the "Export all settings" button is visible.
- Step 2 (click "Export all settings"): a JSON file containing all settings (API keys stripped) downloads.
- Step 3: a status line reads "Exported (API keys stripped)" and says the file still holds the glossary, custom-language examples and site-override host list.

## Visible affordances

- Export is one text button, "Export all settings". It opens no menu.
- Status line uses the success tone tokens; shows the key-exclusion notice (no filename).

## Failure-mode expectations

- Export error -> a red "Export failed: …" status line; there is no retry button.
- Storage read failure (rare) -> inline error; no partial file is offered.

## Cautions

- API keys are NEVER included in the default export; the user must explicitly opt in (see backup-export-with-keys-confirm).
- The exported JSON is valid parseable settings; it can be fed directly into Import.
