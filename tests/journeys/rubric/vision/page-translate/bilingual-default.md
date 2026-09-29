# Page-translate bilingual-default rubric

## Latency budgets

- `page:translateAll` dispatch -> first bilingual sibling inserted: <= 2s warm.

## State expectations

- Step 1: `page:translateAll` runs with `pageTranslateMode: 'bilingual'`.
- Step 2: the v2 segmenter enumerates non-English blocks (broadened selectors: headings, list items, table cells, captions, text-only divs); each becomes one router request.
- Step 3: each translation renders in a sibling block inserted AFTER the original, using the original's tag so typography carries over. The original stays in place, untouched.

## Visible affordances

- Inserted sibling carries `data-ega-tx` + a streaming state attribute that flips streaming -> ok.
- The original block is never mutated — bilingual reading needs both visible at once.

## Failure-mode expectations

- A per-block backend failure flips that block's sibling to an error state with the message; surrounding blocks continue.

## Cautions

- Never re-walk self-injected `data-ega-tx` siblings — that would translate translations.
- Block ids must be stable so out-of-order streaming chunks reach the right sibling.
