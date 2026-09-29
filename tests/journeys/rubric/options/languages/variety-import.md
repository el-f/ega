# Options-languages variety-import rubric

## Latency budgets

- File pick -> parse + confirm dialog: <= 300ms.
- Confirm -> storage write + list refresh: <= 500ms.

## State expectations

- Step 1: user clicks Import; file picker opens.
- Step 2: user picks a valid JSON file containing an array of variety objects; a confirm dialog shows the count of varieties to import.
- Step 3 (confirm): `customLanguages` is replaced with the imported entries; the list refreshes showing the new count.
- A toast confirms import with the entry count.

## Visible affordances

- Import button uses an upload icon; carries an accessible name.
- Confirm dialog shows the variety count and warns that existing custom varieties will be replaced.
- Imported count appears in the toast ("Imported 5 varieties").

## Failure-mode expectations

- Invalid JSON (syntax error) surfaces an inline error; no write, no confirm dialog.
- Valid JSON that does not match the variety schema: per-entry validation errors surfaced; import is blocked until the file is corrected.
- Empty array in file: error "No varieties in file"; no write.

## Cautions

- Import REPLACES `customLanguages` entirely — it does not merge. The confirm dialog must make this clear.
- Cancel at the confirm step leaves `customLanguages` untouched.
- Type-to-confirm is NOT required here (cancellable via Undo if supported, and the file is still available to re-import).
