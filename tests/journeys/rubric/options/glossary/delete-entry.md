# Options-glossary delete-entry rubric

## Latency budgets

- Trash icon click -> entry removed from list + storage write: <= 300ms.

## State expectations

- Step 1: glossary list has at least one entry.
- Step 2 (click trash icon on a row): the entry is removed from the visible list.
- Step 3: `settings.glossary` no longer contains the deleted entry; storage reflects the removal.

## Visible affordances

- Trash icon button is visible on each row; uses the danger tone tokens on hover.
- No confirm dialog — single-entry delete is reversible by re-adding the entry.

## Failure-mode expectations

- Storage write failure surfaces an inline error toast; the row remains visible.
- Deleting the last entry surfaces the empty state immediately.

## Cautions

- Glossary delete has NO confirm by design (low risk, easily re-added). Do NOT add a confirm dialog.
- Settings write must go through `updateSettings` so deep-merge + lock invariants hold.
- Deletion takes effect on the next translation dispatch; in-flight translates are not updated.
