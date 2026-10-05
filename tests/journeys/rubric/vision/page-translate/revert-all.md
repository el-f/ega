# Page-translate revert-all rubric

## Latency budgets

- Cancel click -> all blocks reverted: <= 500ms (local DOM work, no network).

## State expectations

- Step 1: a v2 batch has mounted translation blocks (bilingual siblings or in-place wrappers).
- Step 2: the user clicks Cancel on the progress widget (wired to `cancelPageTranslateV2`).
- Step 3: every mounted block reverts — bilingual siblings are removed, in-place wrappers restore the captured original — and the store is cleared.
- Stop mid-batch keeps the finished areas, drops the rest, and the pill reads "Stopped · N of M areas translated" with a bar that shows N of M in a neutral tone; Undo all then reverts the kept areas and removes the pill.

## Visible affordances

- The progress widget carries a discoverable Cancel control; revert is immediate and total.
- After revert the page DOM matches its pre-translate state.

## Failure-mode expectations

- A single block's revert throwing must not block the rest — revert is best-effort per block.

## Cautions

- In-flight router requests must also be canceled on revert so tokens are not spent for blocks whose target DOM is gone.
- Revert must not leave orphaned `data-ega-tx` / `data-ega-replaced` nodes.
