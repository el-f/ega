# Page-translate inplace-mode-opt-in rubric

## Latency budgets

- `page:translateAll` dispatch -> first block replaced: <= 2s warm.

## State expectations

- Step 1: `pageTranslateMode` is `'inplace'` (the default; the toolbar's Replace text button also picks it).
- Step 2: translate-areas mode opens; the user picks blocks and fires them, the same as in bilingual mode.
- Step 3: each block's content is replaced by a wrapper keyed by the stable block id (`data-ega-replaced="b-…"`); no sibling is inserted.

## Visible affordances

- The replacement wrapper streams the translation in place; the captured original drives revert.
- No `data-ega-tx` siblings appear in this mode.

## Failure-mode expectations

- A per-block failure flips the wrapper to an error state; the captured original is recoverable via revert.

## Cautions

- The captured original fragment must survive for revert — losing it strands the user in the target language.
- In-place replace has a smaller DOM footprint than bilingual; do not leak detached wrappers.
