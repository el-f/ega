# Options-settings-search fuzzy-search rubric

## Latency budgets

- Keystroke -> result list update: <= 50ms.

## State expectations

- Step 1: settings-search modal is mounted with the input focused.
- Step 2: user types; the result list narrows against a fuzzy index of settings spec entries (label + description + tab).
- Step 3: each result row names the target tab and a highlighted fragment of the matched label.

## Visible affordances

- Result list is keyboard-navigable (Up / Down).
- Matched substring is highlighted with the accent token; non-matching context is dimmed.

## Failure-mode expectations

- Empty query shows nothing (NOT the full list — it would be enormous).
- Zero matches surfaces an empty state with a hint ("No setting matches \"<query>\"").

## Cautions

- The fuzzy match must be tolerant of typos (one-character edits) but not so loose that "color" matches "rules".
- The index is built once on modal mount; type-ahead reads the prebuilt index, not the settings store live.
