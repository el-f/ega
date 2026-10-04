# Options-backends backup-import-all-settings rubric

## Latency budgets

- File pick -> parse + confirm dialog: <= 400ms.
- Confirm -> storage overwrite + status shown: <= 600ms.

## State expectations

- Step 1: user clicks Import; file picker opens.
- Step 2: user picks a valid JSON settings file; a confirm dialog appears warning that all settings will be overwritten.
- Step 3 (Continue): when the file carries API keys, a second dialog "Keep API keys from file?" offers Keep keys / Strip keys; a file with no keys skips it and keeps the current keys. Either way storage is overwritten and the status line reads "Imported all settings."
- All UI panels refresh to reflect the imported values.

## Visible affordances

- Confirm dialog "Import settings" says importing overwrites current settings and custom languages; Continue uses the danger tone.
- Status line uses the success tone tokens and reads "Imported all settings." (no filename).

## Failure-mode expectations

- Invalid JSON surfaces an inline error; no write, no confirm dialog.
- A file that is not valid JSON or not an Ega export shows "Import failed: …" before any dialog (a languages export is accepted here and opens its own Replace dialog; an old task-presets file is refused with "Import failed: This is an old task-presets file. Import a full backup instead."); bad fields inside settings are clamped or reset to defaults, not listed.
- Storage write failure shows "Import failed: …" in the status line.

## Cautions

- Import REPLACES all settings including custom languages, glossary, rules, and backend config. Confirm dialog must make the scope clear.
- API keys from the file are written only if the user picks "Keep keys"; "Strip keys", or a file with no keys, keeps the current keys.
