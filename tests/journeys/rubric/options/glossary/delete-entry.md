# Options-glossary delete-entry rubric

## Latency budgets

- Trash icon click -> entry removed from list + storage write: <= 300ms.

## State expectations

- Step 1: glossary list has at least one entry.
- Step 2 (click trash icon on a row): the entry is removed from the visible list.
- Step 3: `settings.glossary` no longer contains the deleted entry; storage reflects the removal.

## Visible affordances

- Trash icon button is visible on each row; uses the danger tone tokens on hover.
- No confirm dialog — a "Removed "<term>"." toast with Undo puts the entry back at its old position.

## Failure-mode expectations

- Storage write failure shows a warning toast ("Change not saved: …"); the row remains visible.
- Deleting the last entry surfaces the empty state immediately.

## Cautions

- Glossary delete has NO confirm by design (low risk, easily re-added). Do NOT add a confirm dialog.
- Settings write goes through `replaceSettings` inside the settings lock; the entry is matched by value, so a glossary another surface changed meanwhile is not corrupted.
- Deletion takes effect on the next translation dispatch; in-flight translates are not updated.
