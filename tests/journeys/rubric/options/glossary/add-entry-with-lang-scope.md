# Options-glossary add-entry-with-lang-scope rubric

## Latency budgets

- Click "Add entry" -> entry visible in list + storage write: <= 500ms.

## State expectations

- Step 1: user fills term + translation; picks source language and target language from the dropdowns; enables case-sensitive checkbox.
- Step 2 (click Add): the entry is added to `settings.glossary` with all fields: term, translation, sourceLang, targetLang, caseSensitive=true.
- Step 3: the new row appears in the glossary list showing all configured fields; form clears.

## Visible affordances

- Source and target lang dropdowns default to "Any" (no language restriction).
- "Match case" checkbox defaults off.
- Row shows the lang scope as small muted text, source → target (e.g. "en → fr"; "any" when unset; a variety shows its label); a case-sensitive entry shows an "Aa" badge.

## Failure-mode expectations

- Submitting with source lang set but target lang left as "Any" (or vice versa) is valid — partial scope is allowed.
- Term or translation > 100 chars: inline error, no write.
- Glossary at cap (200 entries): inline error, no write.

## Cautions

- Lang scope filters when the glossary is applied at dispatch time; setting it incorrectly means the term won't be used for some translations.
- Settings write goes through `replaceSettings` inside the settings lock; the full entry object (all fields) is written in one write.
