# Options-languages variety-import rubric

## Latency budgets

- File pick -> parse + confirm dialog: <= 300ms.
- Confirm -> storage write + list refresh: <= 500ms.

## State expectations

- Step 1: user clicks Import; file picker opens.
- Step 2: user picks an `egaVarieties` export file; a "Replace your custom languages and edits?" dialog shows the file's custom-language and override counts.
- Step 3 (click Replace): `customLanguages`, `varietyOverrides` and `disabledVarieties` are replaced; the list refreshes.
- An inline status line confirms the import with its counts.

## Visible affordances

- "Import languages…" control uses a download (arrow-down) icon and its visible text as the accessible name.
- Confirm dialog shows the variety count and warns that existing custom varieties will be replaced.
- Inline status reads "Imported N custom languages, M overrides, K disabled languages."

## Failure-mode expectations

- Invalid JSON (syntax error) surfaces an inline error; no write, no confirm dialog.
- Bad bundle shape (no custom-language list, or a version this build does not know) -> inline "Import failed: …"; a broken row, edit, prompt or off-list id is skipped and counted ("Skipped N broken entries"), unknown keys are ignored, and a long field is cut to its limit.
- A bundle with no custom languages is valid; Replace clears the existing custom languages.
- A one-language (`egaLanguage`) file picked on the same Import adds that language next to the others after an "Add" confirm, or, when a custom language with the same id exists, replaces only that one after a "Replace" confirm. A file whose language takes a built-in id is refused before any confirm.

## Cautions

- Import REPLACES `customLanguages` entirely — it does not merge. The confirm dialog must make this clear.
- Cancel at the confirm step leaves `customLanguages` untouched.
- Type-to-confirm is NOT required; there is no Undo (the dialog says so), but the file can be re-imported.
