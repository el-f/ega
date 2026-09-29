# Tooltip direction-swap rubric

## Latency budgets

- Swap click -> direction updates: <= 80ms (purely client-side toggle).
- Subsequent translate request: standard cold/warm latency budgets apply.

## State expectations

- Step 1: tooltip shows source -> target direction with a swap control between them.
- Step 2 (click swap): target and source swap atomically (no flicker, no intermediate "blank" state).
- Step 3: the translation re-runs with the new direction; the previous result is replaced (not appended).

## Visible affordances

- Swap control has an `aria-label` like "Swap languages" — never a bare arrow icon without context.
- Direction labels update immediately, not after the new translation arrives.

## Failure-mode expectations

- If detection failed and source language is `auto`, swap should disable itself or surface "Select source first" — never silently no-op.

## Cautions

- The direction pill in the topbar must stay in sync with the actual request body. A swap that doesn't flow through to the request shape is a real bug.
