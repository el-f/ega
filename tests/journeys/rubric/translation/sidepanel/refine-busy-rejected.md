# Sidepanel refine-busy-rejected rubric

## Latency budgets

- Previous-variant click -> variant 1 shown with "· 2 loading": <= 100ms.

## State expectations

- Step 1: the first reply is done; Refine opens the chips and Shorter starts variant 2, which keeps streaming.
- Step 2: the user steps back to variant 1. The card is done again, so the Refine button returns, but the counter reads "1/2 · 2 loading".
- Step 3: opening the chips shows every chip disabled, and the chip group is named "Quick refine — wait for this reply to finish".
- Step 4: a click on a disabled chip sends nothing; exactly two requests have gone out and the counter stays on 1/2.

## Visible affordances

- The disabled chips read as disabled (greyed), not hidden, so the user sees why nothing happens.
- Refine chips never show on a streaming turn; when a done variant is viewed while a sibling streams, they render disabled.

## Failure-mode expectations

- A third variant or a third request while variant 2 streams is a regression.

## Cautions

- The rejection must be enforced in the state machine too, not only via disabled chips: `refine()` bails while a reply is in flight (unit-tested).
- Exactly zero extra requests must fire; verify via request count, not just UI state.
