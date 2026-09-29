# Snippets body-at-max-length-truncates rubric

## Latency budgets

- Truncation applied -> storage write with truncated body: <= 300ms after last keystroke.

## State expectations

- Step 1: user adds a snippet; types 8193 characters into the body textarea.
- Step 2 (debounced write fires): the storage write captures only the first 8192 characters (`BODY_MAX`).
- Step 3: a subtle truncation indicator appears (e.g., a character counter at 8192/8192 in warning tone).

## Visible affordances

- A character counter below the textarea shows current / max (e.g., "8193 / 8192" in danger tone when over).
- The textarea allows typing beyond the limit (not a hard clamp in the UI) but storage receives only `BODY_MAX` chars.

## Failure-mode expectations

- The storage must contain exactly 8192 characters — not 8193, not a partially-written value.
- The truncation must be silent from a UX standpoint (no disruptive error dialog), but the counter must communicate the limit was reached.

## Cautions

- `BODY_MAX = 8192` — verify against the snippets source constant.
- Truncation is a storage-layer constraint; the textarea itself is not character-limited so as not to interrupt typing.
