# Options-backends backup-import-all-settings rubric

## Latency budgets

- File pick -> parse + confirm dialog: <= 400ms.
- Confirm -> storage overwrite + status shown: <= 600ms.

## State expectations

- Step 1: user clicks "Import settings..." in Advanced > Data > Backup and restore; the file picker opens.
- Step 2: user picks a valid backup; the dialog "Import settings?" says "This replaces your current settings ... with the ones in <file name>." with "Import" and "Keep current settings".
- Step 3 (Import): when the file carries API keys, a second dialog "Keep API keys from file?" offers Keep keys / Strip keys; a file with no keys skips it and keeps the current keys. Either way storage is overwritten and the status line reads "Imported all settings."
- A backup with broken custom languages imports the rest and says "Imported settings; N languages were skipped because they were not valid."
- All UI panels refresh to reflect the imported values.

## Visible affordances

- The confirm names the file and what it replaces; Import uses the danger tone, Keep current settings is the safe button.
- Status line uses the success tone tokens.

## Failure-mode expectations

- A file that is not JSON or not an Ega backup shows "This file is not an Ega backup. Pick a file you exported from Ega." before any dialog; no write. A languages export is accepted here and opens its own Replace dialog; an old task-presets file is refused with "This is an old task-presets file. Import a full backup instead."
- A backup from a newer Ega shows "This backup is from a newer Ega. Update Ega, then import it."
- Bad fields inside settings are clamped or reset to defaults, not listed.
- A storage write failure shows "Import failed: …" in the status line.

## Cautions

- Import REPLACES all settings including custom languages, glossary, rules, and backend config. The confirm must make the scope clear.
- API keys from the file are written only if the user picks "Keep keys"; "Strip keys", or a file with no keys, keeps the current keys.
