# Options-settings-search fuzzy-search rubric

## Latency budgets

- Keystroke -> result list update: <= 50ms.

## State expectations

- Step 1: settings-search modal is mounted with the input focused.
- Step 2: user types; the result list narrows against the settings registry (label, id, description, keywords), with a typo fallback for 4+ char queries.
- Step 3: each result row shows a tab badge, the full label and the description, with the query substring marked.

## Visible affordances

- Result list is keyboard-navigable (Up / Down).
- Matched substring is highlighted with the accent token; non-matching context is dimmed.

## Failure-mode expectations

- Empty query shows an example-query hint plus "Recently used" (up to 5) and "Popular settings" suggestions, never the full list.
- Zero matches shows "No settings match "<query>". Check the spelling or try a different word."; with Modified only on and unmodified hits, it says "No modified settings match — uncheck Modified only."

## Cautions

- The fuzzy match must be tolerant of typos (one-character edits) but not so loose that "color" matches "rules".
- The index is the static settings registry; typing never reads storage, and Modified only uses the page's live settings, re-read when the modal opens and on every settings change.
