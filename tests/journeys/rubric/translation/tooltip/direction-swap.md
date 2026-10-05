# Tooltip direction-swap rubric

## Latency budgets

- Swap click -> direction updates: <= 80ms (purely client-side toggle).
- Subsequent translate request: standard cold/warm latency budgets apply.

## State expectations

- Step 1: the meta row shows the direction as "src→tgt" (e.g. "en→es"); a swap icon button sits in the action row.
- Step 2 (click swap): the tooltip reopens at once with the swapped direction and a loading shimmer.
- Step 3: the translation re-runs with the new direction; the previous result is replaced (not appended).

## Visible affordances

- Swap control has `aria-label="Swap direction"` — never a bare arrow icon without context. Its hover text names the new pair: "Swap languages and translate again (es → en)". It re-sends the original selection with the pair flipped; it does not translate the reply back.
- Direction labels update immediately, not after the new translation arrives.

## Failure-mode expectations

- If detection failed and source language is `auto`, swap is disabled and its hover text reads "Swap languages: pick a source language first" — never a silent no-op.

## Cautions

- The direction label in the meta row must stay in sync with the actual request body. A swap that doesn't flow through to the request shape is a real bug.
