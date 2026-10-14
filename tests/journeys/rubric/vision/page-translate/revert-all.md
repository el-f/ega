# Page-translate revert-all rubric

## Latency budgets

- Remove translation click -> all blocks reverted: <= 500ms (local DOM work, no network).

## State expectations

- Step 1: a session has settled with translated blocks (bilingual siblings or in-place wrappers).
- Step 2: Show original (a toggle with `aria-pressed`, constant label) hides every translation and shows the page's own text; pressing it again brings the translations back.
- Step 3: More (⋯) -> Remove translation reverts every mounted block, clears the store and removes the pill.
- Stop mid-batch lets the blocks in flight finish and starts nothing new; a block whose retryable failure lands after Stop goes back to its original. The pill then reads "Stopped. Translated N of M areas."

## Visible affordances

- While running the pill shows Stop. After settle it shows Show original, More and Close bar; Remove translation sits in More.
- After Remove translation the page DOM matches its pre-translate state.

## Failure-mode expectations

- A single block's revert throwing must not block the rest; revert is best-effort per block.

## Cautions

- Remove translation cancels requests still in flight, so tokens are not spent for blocks whose target DOM is gone.
- Revert must not leave orphaned `data-ega-tx` / `data-ega-replaced` nodes.
