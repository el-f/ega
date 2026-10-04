# Options-backends backup-import-cancel rubric

## Latency budgets

- Cancel click -> dialog dismiss: <= 100ms.

## State expectations

- Step 1: user picks a valid import file; the confirm dialog is visible.
- Step 2 (click Cancel): the dialog dismisses without writing to storage.
- Step 3: all settings remain at their pre-import values; no status line shows.

## Visible affordances

- Cancel is a secondary action button in the confirm dialog.

## Failure-mode expectations

- Cancel always succeeds — it is a no-op against storage.

## Cautions

- Cancel at the confirm step is the last safe point before the full settings overwrite.
- The file picker does NOT re-open on cancel; the user must click Import again to retry.
