# Page-translate bilingual-default rubric

## Latency budgets

- `page:translateAll` dispatch -> first bilingual sibling inserted: <= 2s warm.

## State expectations

- Step 1: `page:translateAll` runs with `pageTranslateMode: 'bilingual'`.
- Step 2: translate-areas mode opens; the user picks blocks and presses Enter or Translate; each picked block becomes one router request.
- Step 3: each translation renders in a sibling inserted after the original; headings, list items, definition-list terms/details, table cells, pre, blockquote and figcaption keep their tag, others become a div or span. The original stays untouched.

## Visible affordances

- Inserted sibling carries `data-ega-tx` + a streaming state attribute that flips streaming -> ok.
- The original block is never mutated — bilingual reading needs both visible at once.

## Failure-mode expectations

- A per-block failure empties that block's sibling and shows the error chip (catalog title, no hover-only detail) with Try again, or Open settings when a setting fixes it; surrounding blocks continue. The raw provider text is in the pill's Error details.

## Cautions

- Never re-walk self-injected `data-ega-tx` siblings — that would translate translations.
- Block ids must be stable so out-of-order streaming chunks reach the right sibling.
