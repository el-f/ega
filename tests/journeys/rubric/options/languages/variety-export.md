# Options-languages variety-export rubric

## Latency budgets

- Export click -> download triggered: <= 300ms.

## State expectations

- Step 1: user clicks the Export button.
- Step 2: an `egaVarieties` JSON file downloads with custom languages, built-in overrides, disabled ids and each language's own prompt.
- Step 3: an inline status line confirms "Exported N custom languages, M overrides."

## Visible affordances

- "Export languages" button uses an upload (arrow-up) icon and its visible text as the accessible name.
- Each custom row also has a download icon button named "Export <label> to a file"; it saves an `egaLanguage` file with that one language, its examples, its detection pattern and its own prompt, and confirms with a toast. Built-in rows have no such button.

## Failure-mode expectations

- No custom languages -> Export still works and reports "Exported 0 custom languages, …".
- An export error shows an inline "Export failed: …" banner; no retry button.

## Cautions

- Export is read-only — it never mutates `customLanguages`.
- The exported JSON is plain text; no encoding or compression.
- Filename includes the export date (no spaces) so multiple exports don't collide.
