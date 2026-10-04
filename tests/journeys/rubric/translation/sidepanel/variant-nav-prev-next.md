# Sidepanel variant-nav-prev-next rubric

## Latency budgets

- Prev/Next button click -> body swaps: <= 50ms (local state swap, no network).

## State expectations

- Step 1: a refine chip was clicked; variant 2 of 2 is visible with a "2/2" indicator.
- Step 2 (click prev): the variant indicator reads "1/2"; the assistant turn body reverts to the original (variant 1) content.
- Step 3 (click next): indicator reads "2/2" again; body shows the refined variant content.

## Visible affordances

- Variant navigation shows as a "1/2" / "2/2" counter with prev/next arrow buttons in the AssistantTurn header.
- Prev arrow is disabled (or absent) at variant 1; Next arrow disabled (or absent) at the last variant.

## Failure-mode expectations

- Clicking prev when already at variant 1 -> no-op; no wrapping to the last variant.
- Clicking next when at the last variant -> no-op; no wrapping.

## Cautions

- Navigation is purely local — no backend requests fire on prev/next.
- Both variant bodies must be fully retained in memory; navigating away and back must not re-fetch.
- The "1/2" counter and the body must update atomically — no flash where counter says 1 but body shows variant 2.
