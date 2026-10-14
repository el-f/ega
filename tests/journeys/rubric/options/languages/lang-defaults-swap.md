# Options-languages lang-defaults-swap rubric

## Latency budgets

- Swap click -> source/target fields flip + storage write: <= 200ms.
- Toast appears: <= 300ms after click.

## State expectations

- Step 1: Languages tab shows default source lang A and target lang B.
- Step 2 (click Swap): source field shows B; target field shows A.
- Step 3: both values persist to storage; a brief success toast confirms the swap.

## Visible affordances

- Swap button sits between the source and target selects; uses a swap/arrows icon named "Swap languages". Both selects are the same width.
- Toast is non-blocking and hides after 6s; the timer waits while the pointer or focus is on it.

## Failure-mode expectations

- When the source is Auto-detect, Swap stays focusable but aria-disabled, and the line "Swap needs a source language, not Auto-detect" under the pickers is its description: no write, no toast. There is no separate guard for source equal to target.
- Storage write failure shows a "Change not saved" warning toast; the "Languages swapped" success toast still shows because it fires before the write settles.

## Cautions

- Swap does NOT reset any other translate settings (task, tone, temperature).
- The new defaults take effect on the next translation dispatch; mounted tooltips are not updated mid-session.
