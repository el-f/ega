# Options-languages variety-import-cancel rubric

## Latency budgets

- Cancel click -> dialog dismiss: <= 100ms.

## State expectations

- Step 1: user picks a valid import file; the confirm dialog is visible.
- Step 2 (click Cancel): the dialog dismisses without writing to storage.
- Step 3: `customLanguages` in storage is unchanged; the list still shows the pre-import entries.

## Visible affordances

- Cancel is a secondary action button in the confirm dialog; positioned distinct from the confirm action.

## Failure-mode expectations

- There is no failure mode for cancel — it is always safe to cancel.

## Cautions

- Cancel at the confirm step is the last safe point; once the user confirms, the replacement is committed.
- The list must show the unchanged entries immediately after cancel — no loading flicker.
