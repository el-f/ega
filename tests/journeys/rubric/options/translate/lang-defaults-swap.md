# Options-translate lang-defaults-swap rubric

## Latency budgets

- Swap click -> source/target fields flip + storage write: <= 200ms.
- Toast appears: <= 300ms after click.

## State expectations

- Step 1: Translate tab shows default source lang A and target lang B.
- Step 2 (click Swap): source field shows B; target field shows A.
- Step 3: both values persist to storage; a brief success toast confirms the swap.

## Visible affordances

- Swap button sits between the source and target selects; uses a swap/arrows icon with aria-label.
- Toast is brief (~2s) and non-blocking.

## Failure-mode expectations

- Swapping when source equals target is a no-op (no write, no toast).
- Storage write failure surfaces an inline error; fields revert to prior values.

## Cautions

- Swap does NOT reset any other translate settings (task, tone, temperature).
- The new defaults take effect on the next translation dispatch; mounted tooltips are not updated mid-session.
