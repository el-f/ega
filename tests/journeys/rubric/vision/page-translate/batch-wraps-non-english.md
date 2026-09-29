# Page-translate batch-wraps-non-english rubric

## Latency budgets

- `page:translateAll` dispatch -> first paragraph wrapped: <= 2s warm.

## State expectations

- Step 1: `page:translateAll` runs on a page with mixed English + non-English paragraphs.
- Step 2: the heuristic gate enumerates non-English paragraphs; each is sent to the backend as a batched request.
- Step 3: each translated paragraph renders next to the source paragraph wrapped in a token-styled container.

## Visible affordances

- Wrapper container carries a subtle border + label ("Translated") for hover detail.
- The original paragraph remains visible underneath OR adjacent (per user's default-display setting).

## Failure-mode expectations

- A per-paragraph backend failure degrades locally — the failing paragraph stays in source language with an inline error icon; surrounding paragraphs continue.

## Cautions

- The heuristic must be conservative — false positives that send English to the LLM cost money without benefit.
- Wrappers must NOT mutate paragraph IDs or break CSS selectors the page uses.
