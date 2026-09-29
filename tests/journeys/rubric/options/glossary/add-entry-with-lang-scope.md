# Options-glossary add-entry-with-lang-scope rubric

## Latency budgets

- Click "Add entry" -> entry visible in list + storage write: <= 500ms.

## State expectations

- Step 1: user fills term + translation; picks source language and target language from the dropdowns; enables case-sensitive checkbox.
- Step 2 (click Add): the entry is added to `settings.glossary` with all fields: term, translation, sourceLang, targetLang, caseSensitive=true.
- Step 3: the new row appears in the glossary list showing all configured fields; form clears.

## Visible affordances

- Source and target lang dropdowns default to "Any" (no language restriction).
- Case-sensitive checkbox defaults off.
- Row in the list shows the picked lang scope as small badges (e.g. "EN → AR").

## Failure-mode expectations

- Submitting with source lang set but target lang left as "Any" (or vice versa) is valid — partial scope is allowed.
- Term or translation > 100 chars: inline error, no write.
- Glossary at cap (200 entries): inline error, no write.

## Cautions

- Lang scope filters when the glossary is applied at dispatch time; setting it incorrectly means the term won't be used for some translations.
- Settings write must go through `updateSettings`; the full entry object (all fields) must be written atomically.
