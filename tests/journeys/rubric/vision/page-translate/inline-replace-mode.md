# Page-translate inline-replace-mode rubric

## Latency budgets

- Per-paragraph swap after translation lands: <= 100ms.

## State expectations

- Step 1: `pageTranslateMode === 'inline-replace'` in user settings.
- Step 2: each translated paragraph's source text is replaced in place by the translation; the wrapper container is NOT used.
- Step 3: a page-level marker indicates inline-replace is active so the user knows Esc will restore.

## Visible affordances

- A subtle underline / icon next to each replaced paragraph indicates it's been modified.
- Page-level marker surfaces in a corner ("Inline mode — Esc to restore").

## Failure-mode expectations

- ContentEditable boundaries: replacement skips read-only DOM nodes; those paragraphs stay in source language.
- Per-paragraph failure leaves the source paragraph untouched (no half-replacement).

## Cautions

- Replacement must preserve inline styling (bold, italic, links). Naive textContent overwrite loses these.
- The mode is opt-in via settings — never default to inline-replace.
