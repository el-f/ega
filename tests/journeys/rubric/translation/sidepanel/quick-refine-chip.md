# Sidepanel quick-refine-chip rubric

## Latency budgets

- Chip click -> refine request fired: <= 100ms.
- First refined token: warm <= 1.5s.

## State expectations

- Step 1: an assistant turn has completed; quick-refine chips render below it ("Shorter", "Less formal", "Keep slang", plus a "Refine" toggle).
- Step 2 (click chip): the last assistant turn gains a new variant (counter 2/2) that streams the refinement of the same source input; the earlier answer stays as variant 1.
- Step 3: on success, the new assistant turn carries a small marker indicating which refinement was applied.

## Visible affordances

- Chips are keyboard-activatable; carry clear labels (not just icons).
- Chips are hidden during a stream (no chip-click mid-stream).

## Failure-mode expectations

- Refinement failure surfaces an inline error with Retry on the new variant; the prior version stays reachable via the prev-variant arrow.

## Cautions

- Refine must NOT append a new user turn — it adds a variant to the existing assistant turn and keeps the earlier answer.
- Repeated refine cycles must preserve the original user input; do not let the refined output replace the source.
