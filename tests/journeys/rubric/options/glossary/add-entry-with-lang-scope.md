# Options-glossary add-entry-with-lang-scope rubric

## Latency budgets

- Click "Add" -> entry visible in the list + storage write: <= 500ms.

## State expectations

- Step 1: the user fills Term and Translation, opens "More options", picks a source and a target language, and turns on Match case.
- Step 2 (Add): the entry is stored with term, translation, sourceLang, targetLang and caseSensitive=true.
- Step 3: the row shows "Term → Translation", the scope in muted text ("English → French"), and "Match case".

## Visible affordances

- Source and target default to "Any"; Match case defaults off.
- With the default source on Auto-detect, a source-scoped entry shows one line: "Applies only when you pick <language> as the source".

## Failure-mode expectations

- A partial scope (source set, target "Any") is valid.
- An empty field or a duplicate in the same scope is refused in place.

## Cautions

- Scope filters when the glossary is applied at dispatch time; a wrong scope means the term is not used for some requests.
- The full entry is written in one `replaceSettings` call.
