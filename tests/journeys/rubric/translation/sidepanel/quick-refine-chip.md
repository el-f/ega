# Sidepanel quick-refine-chip rubric

## Latency budgets

- Chip click -> refine request fired: <= 100ms.
- First refined token: warm <= 1.5s.

## State expectations

- Step 1: an assistant turn has completed; quick-refine chips render below it (e.g., "More casual", "Simpler", "Literal").
- Step 2 (click chip): the LAST assistant turn is replaced in place by a new stream that applies the refinement to the same source input.
- Step 3: on success, the new assistant turn carries a small marker indicating which refinement was applied.

## Visible affordances

- Chips are keyboard-activatable; carry clear labels (not just icons).
- Chips are hidden during a stream (no chip-click mid-stream).

## Failure-mode expectations

- Refinement failure surfaces an inline error on the new assistant slot with retry; the prior version is restored on dismiss.

## Cautions

- Refine must NOT append a new user turn — it amends the existing assistant turn (mirrors retry-after-error semantics).
- Repeated refine cycles must preserve the original user input; do not let the refined output replace the source.
