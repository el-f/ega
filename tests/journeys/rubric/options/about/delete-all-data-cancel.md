# Options-about delete-all-data-cancel rubric

## Latency budgets

- Cancel click -> dialog dismiss: <= 100ms.

## State expectations

- Step 1: type-to-confirm dialog is visible; user has typed a wrong or partial confirm phrase (or nothing).
- Step 2 (click Cancel or clear + close): dialog dismisses without writing to storage.
- Step 3: all extension data remains untouched; the About tab is back in view.

## Visible affordances

- Delete button is disabled (wrong confirm text); Cancel is always enabled.
- Cancel is a secondary button in the dialog footer.

## Failure-mode expectations

- Cancel always succeeds; it is a safe no-op.

## Cautions

- Even with a correct phrase typed, Cancel discards the operation — the Delete button click is required to commit.
- The dialog must trap focus while open; Esc must also cancel and return focus to the About panel.
