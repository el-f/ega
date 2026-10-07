# Options-glossary delete-entry rubric

## Latency budgets

- Delete entry click -> entry removed from the list + storage write: <= 300ms.

## State expectations

- Step 1: the list has at least one entry; the user presses its Edit, and the row opens its fields.
- Step 2 (Delete entry): the entry leaves the list at once; a toast Deleted "<term>" with Undo shows.
- Step 3: `settings.glossary` no longer holds it. Focus moves to the next row's Edit, else the previous one, else Add.

## Visible affordances

- "Delete entry" is a ghost button with a trash icon and a word, inside the open row.
- No confirm dialog; Undo puts the entry back at its old place and focuses it.

## Failure-mode expectations

- A failed write shows a "Not saved" toast and the row stays open.
- Deleting the last entry shows the empty state at once.

## Cautions

- No confirm by design (low risk, Undo is there). Do NOT add a confirm dialog.
- The entry is matched by value inside the settings lock, so a glossary another surface changed meanwhile is not corrupted.
