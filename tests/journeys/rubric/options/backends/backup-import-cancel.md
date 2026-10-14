# Options-backends backup-import-cancel rubric

## Latency budgets

- Keep current settings click -> dialog dismiss: <= 100ms.

## State expectations

- Step 1: user picks a valid backup; the "Import settings?" dialog is visible.
- Step 2 (click "Keep current settings"): the dialog dismisses without writing to storage.
- Step 3: all settings remain at their pre-import values; no status line shows.

## Visible affordances

- "Keep current settings" is the secondary button in the dialog footer.

## Failure-mode expectations

- Keep current settings always succeeds — it is a no-op against storage.

## Cautions

- This is the last safe point before the full settings overwrite.
- The file picker does NOT re-open; the user must click Import settings... again to retry.
