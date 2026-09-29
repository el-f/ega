# Options-backends backup-import-all-settings rubric

## Latency budgets

- File pick -> parse + confirm dialog: <= 400ms.
- Confirm -> storage overwrite + status shown: <= 600ms.

## State expectations

- Step 1: user clicks Import; file picker opens.
- Step 2: user picks a valid JSON settings file; a confirm dialog appears warning that all settings will be overwritten.
- Step 3 (confirm): storage is overwritten with the imported settings; a status line confirms the import.
- All UI panels refresh to reflect the imported values.

## Visible affordances

- Confirm dialog names the operation ("All settings will be replaced") and uses warning-tone tokens.
- Status line uses the success tone tokens; shows the filename.

## Failure-mode expectations

- Invalid JSON surfaces an inline error; no write, no confirm dialog.
- Valid JSON that fails schema validation: validation errors listed; import blocked.
- Storage write failure (quota, etc.) surfaces an inline error; storage state is unknown — the user is advised to reload.

## Cautions

- Import REPLACES all settings including custom languages, glossary, rules, and backend config. Confirm dialog must make the scope clear.
- API keys inside the imported file are written as-is; the user must supply a safe file.
